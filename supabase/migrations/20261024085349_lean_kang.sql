CREATE TABLE "school_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"venue_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"created_by" uuid DEFAULT auth.uid(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_events_title_not_blank" CHECK (length(trim("school_events"."title")) > 0),
	CONSTRAINT "school_events_time_order" CHECK ("school_events"."start_time" is null or "school_events"."end_time" is null or "school_events"."end_time" > "school_events"."start_time")
);
--> statement-breakpoint
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_events" ADD CONSTRAINT "school_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_events_venue_date_uidx" ON "school_events" USING btree ("venue_id","event_date");--> statement-breakpoint
CREATE INDEX "school_events_date_idx" ON "school_events" USING btree ("event_date");
--> statement-breakpoint
-- School events take priority over regular bookings. A school event reserves
-- the selected venue for the whole calendar date.
alter table public.school_events enable row level security;

drop policy if exists school_events_select_public on public.school_events;
create policy school_events_select_public
  on public.school_events
  for select
  to anon, authenticated
  using (true);

drop policy if exists school_events_admin_insert on public.school_events;
create policy school_events_admin_insert
  on public.school_events
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists school_events_admin_update on public.school_events;
create policy school_events_admin_update
  on public.school_events
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists school_events_admin_delete on public.school_events;
create policy school_events_admin_delete
  on public.school_events
  for delete
  to authenticated
  using (public.is_admin());

revoke all on public.school_events from anon, authenticated;
grant select on public.school_events to anon, authenticated;
grant insert, update, delete on public.school_events to authenticated;

create or replace function public.cancel_bookings_for_school_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set status = 'cancelled',
      decision_note = 'Cancelled automatically: this venue is reserved for the school event "' ||
        new.title || '" on ' ||
        to_char(new.event_date, 'FMMonth FMDD, YYYY') || '.'
  where venue_id = new.venue_id
    and booking_date = new.event_date
    and status in ('pending', 'approved');

  return new;
end;
$$;

drop trigger if exists school_events_cancel_conflicts on public.school_events;
create trigger school_events_cancel_conflicts
  after insert or update of venue_id, event_date on public.school_events
  for each row
  execute function public.cancel_bookings_for_school_event();

revoke all on function public.cancel_bookings_for_school_event() from public;

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

revoke all on function public.bookings_before_write() from public;

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

  if exists (
    select 1
    from public.school_events e
    where e.venue_id = v_booking.venue_id
      and e.event_date = v_booking.booking_date
  ) then
    raise exception 'This venue is reserved for a school event on the selected date'
      using errcode = '22000';
  end if;

  update public.bookings
  set status = 'approved',
      decision_note = coalesce(p_note, decision_note)
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.approve_booking(uuid, text) from public;
grant execute on function public.approve_booking(uuid, text)
  to authenticated, service_role;

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
    update public.bookings b
    set status = 'approved',
        is_auto_approved = true,
        decision_note = coalesce(
          decision_note,
          'Automatically approved during open season'
        )
    where b.status = 'pending'
      and not exists (
        select 1
        from public.school_events e
        where e.venue_id = b.venue_id
          and e.event_date = b.booking_date
      )
    returning 1
  )
  select count(*) into v_approved from approved;

  return v_approved;
end;
$$;

revoke all on function public.auto_approve_pending_bookings() from public;
grant execute on function public.auto_approve_pending_bookings()
  to authenticated, service_role;
