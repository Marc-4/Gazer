create or replace function public.get_venue_availability(
  p_from date,
  p_to date,
  p_venue_id uuid default null
)
returns table (
  venue_id uuid,
  venue_name text,
  booking_date date,
  start_time time,
  end_time time,
  kind text,
  status text,
  label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null then
    raise exception 'A start and end date are required' using errcode = '22023';
  end if;

  if p_to < p_from then
    raise exception 'The end date must be on or after the start date'
      using errcode = '22023';
  end if;

  if p_to - p_from > 366 then
    raise exception 'The date range cannot exceed 366 days' using errcode = '22023';
  end if;

  return query
    select
      b.venue_id,
      v.name as venue_name,
      b.booking_date,
      b.start_time,
      b.end_time,
      'booking'::text as kind,
      b.status::text as status,
      null::text as label
    from public.bookings b
    join public.venues v on v.id = b.venue_id
    where b.status in ('pending', 'approved')
      and b.booking_date between p_from and p_to
      and (p_venue_id is null or b.venue_id = p_venue_id)
    union all
    select
      e.venue_id,
      v.name as venue_name,
      e.event_date as booking_date,
      e.start_time,
      e.end_time,
      'school_event'::text as kind,
      'blocked'::text as status,
      e.title as label
    from public.school_events e
    join public.venues v on v.id = e.venue_id
    where e.event_date between p_from and p_to
      and (p_venue_id is null or e.venue_id = p_venue_id)
    order by booking_date, venue_name, kind, start_time;
end;
$$;

revoke all on function public.get_venue_availability(date, date, uuid) from public;
grant execute on function public.get_venue_availability(date, date, uuid)
  to anon, authenticated, service_role;
