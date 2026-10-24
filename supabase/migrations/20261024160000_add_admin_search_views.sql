-- Search views expose venue names for database-side filtering while keeping
-- row-level security active for the caller.
drop view if exists public.bookings_search;
create view public.bookings_search
with (security_invoker = true)
as
select
  b.*,
  v.name as venue_name,
  case
    when v.id is null then null
    else jsonb_build_object(
      'id', v.id,
      'name', v.name,
      'address', v.address,
      'capacity', v.capacity
    )
  end as venue
from public.bookings b
left join public.venues v on v.id = b.venue_id;

drop view if exists public.school_events_search;
create view public.school_events_search
with (security_invoker = true)
as
select
  e.*,
  v.name as venue_name,
  case
    when v.id is null then null
    else jsonb_build_object(
      'id', v.id,
      'name', v.name,
      'address', v.address,
      'capacity', v.capacity
    )
  end as venue
from public.school_events e
left join public.venues v on v.id = e.venue_id;

drop view if exists public.venue_upcoming_booking_counts;
create view public.venue_upcoming_booking_counts
with (security_invoker = true)
as
select
  venue_id,
  count(*)::integer as booking_count
from public.bookings
where status in ('pending', 'approved')
  and booking_date >= current_date
group by venue_id;

revoke all on public.bookings_search from anon, authenticated;
revoke all on public.school_events_search from anon, authenticated;
revoke all on public.venue_upcoming_booking_counts from anon, authenticated;
grant select on public.bookings_search to authenticated;
grant select on public.school_events_search to authenticated;
grant select on public.venue_upcoming_booking_counts to authenticated;

notify pgrst, 'reload schema';
