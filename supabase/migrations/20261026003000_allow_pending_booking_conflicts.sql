-- Pending booking requests may overlap each other. Approved bookings remain
-- exclusive, and a new pending request still cannot overlap an approved one.
create extension if not exists btree_gist with schema extensions;

create or replace function public.booking_has_approved_conflict(
  p_booking_id uuid,
  p_venue_id uuid,
  p_booking_date date,
  p_start_time time,
  p_end_time time
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id is distinct from p_booking_id
      and b.venue_id = p_venue_id
      and b.booking_date = p_booking_date
      and b.status = 'approved'
      and (
        p_start_time is null
        or p_end_time is null
        or b.start_time is null
        or b.end_time is null
        or (p_start_time < b.end_time and b.start_time < p_end_time)
      )
  );
$$;

revoke all on function public.booking_has_approved_conflict(uuid, uuid, date, time, time) from public;
grant execute on function public.booking_has_approved_conflict(uuid, uuid, date, time, time)
  to anon, authenticated, service_role;

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
as $$
begin
  if new.status is null then
    new.status := 'pending';
  end if;

  if new.status in ('pending', 'approved') and exists (
    select 1
    from public.school_events e
    where e.venue_id = new.venue_id
      and e.event_date = new.booking_date
  ) then
    raise exception 'This venue is reserved for a school event on the selected date. Choose another venue or date.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    -- Bookers may never create an already-decided request. Only administrators
    -- (or the service role) can insert a non-pending booking directly.
    if new.status <> 'pending'
      and not public.is_admin()
      and coalesce(auth.role(), '') <> 'service_role'
    then
      new.status := 'pending';
    end if;

    -- Pending requests may overlap, but an open season still approves this
    -- request automatically when no approved booking already holds the slot.
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

  if new.status in ('pending', 'approved') then
    if tg_op = 'INSERT' then
      if public.booking_has_approved_conflict(
        new.id,
        new.venue_id,
        new.booking_date,
        new.start_time,
        new.end_time
      ) then
        raise exception 'This venue already has an approved booking during the selected time.'
          using errcode = '23P01';
      end if;
    elsif new.venue_id is distinct from old.venue_id
      or new.booking_date is distinct from old.booking_date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.status is distinct from old.status
    then
      if public.booking_has_approved_conflict(
        new.id,
        new.venue_id,
        new.booking_date,
        new.start_time,
        new.end_time
      ) then
        raise exception 'This venue already has an approved booking during the selected time.'
          using errcode = '23P01';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bookings_before_write() from public;

alter table public.bookings drop constraint if exists "bookings_no_overlap";
alter table public.bookings add constraint "bookings_no_overlap"
  exclude using gist (
    venue_id with =,
    (
      case
        when start_time is null or end_time is null
          then tsrange(booking_date::timestamp, (booking_date + 1)::timestamp, '[)')
        else tsrange((booking_date + start_time)::timestamp, (booking_date + end_time)::timestamp, '[)')
      end
    ) with &&
  )
  where (status = 'approved');

create or replace function public.auto_approve_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_approved integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not public.is_open_season_active(now()) then
    return 0;
  end if;

  for v_booking in
    select b.*
    from public.bookings b
    where b.status = 'pending'
      and not exists (
        select 1
        from public.school_events e
        where e.venue_id = b.venue_id
          and e.event_date = b.booking_date
      )
    order by b.created_at, b.id
    for update
  loop
    begin
      update public.bookings
      set status = 'approved',
          is_auto_approved = true,
          decision_note = coalesce(
            decision_note,
            'Automatically approved during open season'
          )
      where id = v_booking.id;
      v_approved := v_approved + 1;
    exception
      when exclusion_violation then
        null;
    end;
  end loop;

  return v_approved;
end;
$$;

revoke all on function public.auto_approve_pending_bookings() from public;
grant execute on function public.auto_approve_pending_bookings()
  to authenticated, service_role;
