drop function if exists public.get_booking_by_token(uuid);
drop function if exists public.cancel_booking_by_token(uuid, text);

create or replace function public.get_booking_by_token(p_token text)
returns table (
  id uuid,
  reference text,
  venue_name text,
  venue_address text,
  booking_date date,
  start_time time,
  end_time time,
  status public.booking_status,
  activity_name text,
  activity_description text,
  organization_name text,
  requester_name text,
  requester_email text,
  requester_phone text,
  attendee_count integer,
  decision_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.reference,
    v.name,
    v.address,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.status,
    b.activity_name,
    b.activity_description,
    b.organization_name,
    b.requester_name,
    b.requester_email,
    b.requester_phone,
    b.attendee_count,
    b.decision_note,
    b.created_at,
    b.updated_at
  from public.bookings b
  join public.venues v on v.id = b.venue_id
  where b.public_token::text = lower(trim(p_token))
     or upper(b.reference) = upper(trim(p_token));
$$;

create or replace function public.cancel_booking_by_token(
  p_token text,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_lookup text := trim(p_token);
begin
  select * into v_booking
  from public.bookings
  where public_token::text = lower(v_lookup)
     or upper(reference) = upper(v_lookup)
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved bookings can be cancelled'
      using errcode = '22000';
  end if;

  update public.bookings
  set status = 'cancelled',
      decision_note = coalesce(p_note, decision_note)
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.get_booking_by_token(text) from public;
grant execute on function public.get_booking_by_token(text)
  to anon, authenticated, service_role;

revoke all on function public.cancel_booking_by_token(text, text) from public;
grant execute on function public.cancel_booking_by_token(text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
