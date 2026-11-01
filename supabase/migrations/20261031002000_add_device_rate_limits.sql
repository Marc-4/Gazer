-- Device-keyed rate limiting for public booking creation and account invites.
--
-- The browser sends a FingerprintJS visitor id as `x-device-id` and stores it
-- on the booking row. A trigger consumes a rate-limit slot even when the
-- client skips the preflight, so a caller cannot bypass the limit by posting
-- directly to PostgREST. When no device id is available the trigger falls
-- back to the caller's forwarding headers.

alter table public.bookings
  add column if not exists client_device_id text;

create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (scope, key, created_at desc);

alter table public.rate_limit_events enable row level security;

revoke all on public.rate_limit_events from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 1000));
  v_window integer := greatest(1, least(coalesce(p_window_seconds, 60), 86400));
  v_window_start timestamptz;
  v_first timestamptz;
  v_count integer;
  v_retry_after integer;
begin
  if p_scope is null or btrim(p_scope) = ''
    or p_key is null or btrim(p_key) = ''
  then
    raise exception 'Rate limit scope and key are required.'
      using errcode = '22023';
  end if;

  -- Serialize concurrent calls for the same key. The lock is released when
  -- the surrounding transaction ends.
  perform pg_advisory_xact_lock(hashtext(p_scope), hashtext(p_key));

  -- Keep the table small: only the current window matters for this key.
  delete from public.rate_limit_events
  where scope = p_scope
    and key = p_key
    and created_at < now() - make_interval(secs => greatest(v_window, 3600));

  v_window_start := now() - make_interval(secs => v_window);

  select count(*), min(created_at)
  into v_count, v_first
  from public.rate_limit_events
  where scope = p_scope
    and key = p_key
    and created_at >= v_window_start;

  if v_count >= v_limit then
    v_retry_after := greatest(
      1,
      ceil(
        extract(
          epoch from (
            v_first + make_interval(secs => v_window) - now()
          )
        )
      )::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', v_retry_after,
      'limit', v_limit,
      'window_seconds', v_window
    );
  end if;

  insert into public.rate_limit_events (scope, key)
  values (p_scope, p_key);

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(v_limit - v_count - 1, 0),
    'retry_after', 0,
    'limit', v_limit,
    'window_seconds', v_window
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to anon, authenticated, service_role;

create or replace function public.enforce_booking_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb;
  v_device text;
  v_key text;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;

  v_headers := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );

  v_device := nullif(
    btrim(coalesce(new.client_device_id, v_headers ->> 'x-device-id')),
    ''
  );

  v_key := case
    when v_device is not null then 'device:' || v_device
    else 'ip:' || coalesce(
      nullif(
        btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)),
        ''
      ),
      nullif(btrim(v_headers ->> 'x-real-ip'), ''),
      'unknown'
    )
  end;

  if v_key = 'ip:unknown' then
    return new;
  end if;

  v_result := public.consume_rate_limit('booking:create', v_key, 5, 600);

  if not coalesce((v_result ->> 'allowed')::boolean, true) then
    raise exception 'Too many booking requests from this device. Please try again in % minutes.',
      greatest(
        1,
        ceil(coalesce((v_result ->> 'retry_after')::numeric, 600) / 60.0)
      )::integer
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_booking_rate_limit() from public;

drop trigger if exists bookings_rate_limit on public.bookings;
create trigger bookings_rate_limit
  before insert on public.bookings
  for each row
  execute function public.enforce_booking_rate_limit();

notify pgrst, 'reload schema';
