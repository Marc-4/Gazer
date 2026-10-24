-- Supabase-specific objects that Drizzle Kit does not model:
-- auth.users foreign keys, helper functions, triggers, RLS policies, grants
-- and RPC functions.

create extension if not exists pgcrypto;

-- Supabase owns the auth schema, so these foreign keys are added by hand.
alter table public.profiles
  add constraint profiles_id_auth_users_fk
  foreign key (id) references auth.users (id) on delete cascade;

alter table public.bookings
  add constraint bookings_user_id_auth_users_fk
  foreign key (user_id) references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active
  );
$$;

-- ---------------------------------------------------------------------------
-- Profile synchronisation with auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.handle_user_email_updated();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists venues_set_updated_at on public.venues;
create trigger venues_set_updated_at
  before update on public.venues
  for each row
  execute function public.set_updated_at();

drop trigger if exists open_seasons_set_updated_at on public.open_seasons;
create trigger open_seasons_set_updated_at
  before update on public.open_seasons
  for each row
  execute function public.set_updated_at();

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Open season
-- ---------------------------------------------------------------------------

-- Enabled seasons must not overlap, otherwise auto-approval windows are ambiguous.
alter table public.open_seasons
  add constraint open_seasons_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (is_enabled);

create or replace function public.is_open_season_active(p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.open_seasons
    where is_enabled
      and starts_at <= p_at
      and ends_at > p_at
  );
$$;

-- ---------------------------------------------------------------------------
-- Booking business rules
-- ---------------------------------------------------------------------------

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := 'pending';
    end if;

    -- Bookers may never create an already-decided request. Only administrators
    -- (or the service role) can insert a non-pending booking directly.
    if new.status <> 'pending'
      and not public.is_admin()
      and coalesce(auth.role(), '') <> 'service_role'
    then
      new.status := 'pending';
    end if;

    -- The unique index on (venue_id, booking_date) guarantees availability by
    -- the time this trigger succeeds, so an active open season can approve it.
    if new.status = 'pending' and public.is_open_season_active(now()) then
      new.status := 'approved';
      new.is_auto_approved := true;
      new.decided_at := now();
      new.decision_note := coalesce(
        new.decision_note,
        'Automatically approved during open season'
      );
    end if;

    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  else
    new.updated_at := now();

    if new.status is distinct from old.status then
      if new.status in ('approved', 'rejected') then
        new.decided_at := coalesce(new.decided_at, now());
        new.decided_by := coalesce(new.decided_by, auth.uid());
      elsif new.status = 'cancelled' then
        new.cancelled_at := coalesce(new.cancelled_at, now());
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_before_write on public.bookings;
create trigger bookings_before_write
  before insert or update on public.bookings
  for each row
  execute function public.bookings_before_write();

create or replace function public.record_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      new.id,
      null,
      new.status,
      case when new.is_auto_approved then null else auth.uid() end,
      new.decision_note
    );
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history (
      booking_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      new.id,
      old.status,
      new.status,
      case
        when new.is_auto_approved and new.status = 'approved' then null
        else auth.uid()
      end,
      new.decision_note
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_record_status_change on public.bookings;
create trigger bookings_record_status_change
  after insert or update of status on public.bookings
  for each row
  execute function public.record_booking_status_change();

-- ---------------------------------------------------------------------------
-- Email outbox
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venue_name text;
  v_payload jsonb;
  v_booker_template public.email_template;
begin
  select name into v_venue_name
  from public.venues
  where id = new.venue_id;

  v_payload := jsonb_build_object(
    'booking_id', new.id,
    'reference', new.reference,
    'public_token', new.public_token,
    'venue_id', new.venue_id,
    'venue_name', v_venue_name,
    'booking_date', new.booking_date,
    'start_time', new.start_time,
    'end_time', new.end_time,
    'status', new.status,
    'activity_name', new.activity_name,
    'activity_description', new.activity_description,
    'organization_name', new.organization_name,
    'requester_name', new.requester_name,
    'requester_email', new.requester_email,
    'requester_phone', new.requester_phone,
    'attendee_count', new.attendee_count,
    'decision_note', new.decision_note
  );

  if tg_op = 'INSERT' then
    insert into public.notification_outbox (
      booking_id,
      template,
      recipient_email,
      recipient_name,
      payload
    )
    select
      new.id,
      'admin_new_booking'::public.email_template,
      p.email,
      p.full_name,
      v_payload
    from public.profiles p
    where p.role = 'admin'
      and p.is_active
      and p.email is not null;

    v_booker_template := case
      when new.status = 'approved' then 'booker_booking_approved'::public.email_template
      else 'booker_booking_pending'::public.email_template
    end;

    insert into public.notification_outbox (
      booking_id,
      template,
      recipient_email,
      recipient_name,
      payload
    )
    values (
      new.id,
      v_booker_template,
      new.requester_email,
      new.requester_name,
      v_payload
    );
  elsif new.status is distinct from old.status then
    v_booker_template := case new.status
      when 'approved' then 'booker_booking_approved'::public.email_template
      when 'rejected' then 'booker_booking_rejected'::public.email_template
      when 'cancelled' then 'booker_booking_cancelled'::public.email_template
      else 'booker_booking_pending'::public.email_template
    end;

    insert into public.notification_outbox (
      booking_id,
      template,
      recipient_email,
      recipient_name,
      payload
    )
    values (
      new.id,
      v_booker_template,
      new.requester_email,
      new.requester_name,
      v_payload
    );

    if new.status = 'cancelled' then
      insert into public.notification_outbox (
        booking_id,
        template,
        recipient_email,
        recipient_name,
        payload
      )
      select
        new.id,
        'admin_booking_cancelled'::public.email_template,
        p.email,
        p.full_name,
        v_payload
      from public.profiles p
      where p.role = 'admin'
        and p.is_active
        and p.email is not null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_enqueue_notifications on public.bookings;
create trigger bookings_enqueue_notifications
  after insert or update of status on public.bookings
  for each row
  execute function public.enqueue_booking_notifications();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.open_seasons enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists venues_select_active_or_admin on public.venues;
create policy venues_select_active_or_admin
  on public.venues
  for select
  to anon, authenticated
  using (is_active or public.is_admin());

drop policy if exists venues_admin_insert on public.venues;
create policy venues_admin_insert
  on public.venues
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists venues_admin_update on public.venues;
create policy venues_admin_update
  on public.venues
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists venues_admin_delete on public.venues;
create policy venues_admin_delete
  on public.venues
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists bookings_insert_public on public.bookings;
create policy bookings_insert_public
  on public.bookings
  for insert
  to anon, authenticated
  with check (
    status in ('pending', 'approved')
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists bookings_select_own_or_admin on public.bookings;
create policy bookings_select_own_or_admin
  on public.bookings
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update
  on public.bookings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists bookings_admin_delete on public.bookings;
create policy bookings_admin_delete
  on public.bookings
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists booking_status_history_select_own_or_admin on public.booking_status_history;
create policy booking_status_history_select_own_or_admin
  on public.booking_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_status_history.booking_id
        and (b.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists open_seasons_select_active_or_admin on public.open_seasons;
create policy open_seasons_select_active_or_admin
  on public.open_seasons
  for select
  to anon, authenticated
  using (is_enabled or public.is_admin());

drop policy if exists open_seasons_admin_insert on public.open_seasons;
create policy open_seasons_admin_insert
  on public.open_seasons
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists open_seasons_admin_update on public.open_seasons;
create policy open_seasons_admin_update
  on public.open_seasons
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists open_seasons_admin_delete on public.open_seasons;
create policy open_seasons_admin_delete
  on public.open_seasons
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists notification_outbox_select_admin on public.notification_outbox;
create policy notification_outbox_select_admin
  on public.notification_outbox
  for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- API grants
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, organization, phone) on public.profiles to authenticated;

revoke all on public.venues from anon, authenticated;
grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;

revoke all on public.bookings from anon, authenticated;
grant insert on public.bookings to anon;
grant select, insert, update, delete on public.bookings to authenticated;

revoke all on public.booking_status_history from anon, authenticated;
grant select on public.booking_status_history to authenticated;

revoke all on public.open_seasons from anon, authenticated;
grant select on public.open_seasons to anon, authenticated;
grant insert, update, delete on public.open_seasons to authenticated;

revoke all on public.notification_outbox from anon, authenticated;
grant select on public.notification_outbox to authenticated;

-- ---------------------------------------------------------------------------
-- RPC functions
-- ---------------------------------------------------------------------------

create or replace function public.get_booking_by_token(p_token uuid)
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
  where b.public_token = p_token;
$$;

create or replace function public.cancel_my_booking(
  p_booking_id uuid,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if not public.is_admin() and v_booking.user_id is distinct from auth.uid() then
    raise exception 'You are not allowed to cancel this booking' using errcode = '42501';
  end if;

  if v_booking.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved bookings can be cancelled'
      using errcode = '22000';
  end if;

  update public.bookings
  set status = 'cancelled',
      decision_note = coalesce(p_note, decision_note)
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.cancel_booking_by_token(
  p_token uuid,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking
  from public.bookings
  where public_token = p_token
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

create or replace function public.approve_booking(
  p_booking_id uuid,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'Only pending bookings can be approved' using errcode = '22000';
  end if;

  if not exists (
    select 1
    from public.venues
    where id = v_booking.venue_id
      and is_active
  ) then
    raise exception 'The venue is not active' using errcode = '22000';
  end if;

  update public.bookings
  set status = 'approved',
      decision_note = coalesce(p_note, decision_note)
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.reject_booking(
  p_booking_id uuid,
  p_note text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'Only pending bookings can be rejected' using errcode = '22000';
  end if;

  update public.bookings
  set status = 'rejected',
      decision_note = p_note
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.auto_approve_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not public.is_open_season_active(now()) then
    return 0;
  end if;

  with approved as (
    update public.bookings
    set status = 'approved',
        is_auto_approved = true,
        decision_note = coalesce(
          decision_note,
          'Automatically approved during open season'
        )
    where status = 'pending'
    returning 1
  )
  select count(*) into v_approved from approved;

  return v_approved;
end;
$$;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_admin_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admin_count
    from public.profiles
    where role = 'admin'
      and is_active;

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last administrator' using errcode = '22000';
    end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

revoke all on function public.is_open_season_active(timestamptz) from public;
grant execute on function public.is_open_season_active(timestamptz)
  to anon, authenticated, service_role;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_user_email_updated() from public;
revoke all on function public.bookings_before_write() from public;
revoke all on function public.record_booking_status_change() from public;
revoke all on function public.enqueue_booking_notifications() from public;

revoke all on function public.get_booking_by_token(uuid) from public;
grant execute on function public.get_booking_by_token(uuid)
  to anon, authenticated, service_role;

revoke all on function public.cancel_my_booking(uuid, text) from public;
grant execute on function public.cancel_my_booking(uuid, text)
  to authenticated, service_role;

revoke all on function public.cancel_booking_by_token(uuid, text) from public;
grant execute on function public.cancel_booking_by_token(uuid, text)
  to anon, authenticated, service_role;

revoke all on function public.approve_booking(uuid, text) from public;
grant execute on function public.approve_booking(uuid, text)
  to authenticated, service_role;

revoke all on function public.reject_booking(uuid, text) from public;
grant execute on function public.reject_booking(uuid, text)
  to authenticated, service_role;

revoke all on function public.auto_approve_pending_bookings() from public;
grant execute on function public.auto_approve_pending_bookings()
  to authenticated, service_role;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.app_role)
  to authenticated, service_role;

-- Bootstrap the first administrator after signing up:
--   update public.profiles set role = 'admin' where email = 'admin@example.com';
