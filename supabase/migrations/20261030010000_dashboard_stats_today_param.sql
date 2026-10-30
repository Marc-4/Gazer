-- Reconcile the dashboard RPC signatures.
--
-- The first dashboard migration was applied while the functions still had no
-- parameters. Replace those zero-argument versions with the p_today variants
-- used by the dashboard, and make sure anon cannot execute them.

drop function if exists public.get_admin_dashboard();
drop function if exists public.get_booker_dashboard();

create or replace function public.get_admin_dashboard(
  p_today date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_today date := coalesce(p_today, current_date);
  v_summary jsonb;
  v_pending_aging jsonb;
  v_oldest_pending jsonb;
  v_turnaround_all_time jsonb;
  v_turnaround_30d jsonb;
  v_outcome_mix jsonb;
  v_venue_utilization jsonb;
  v_demand_trend jsonb;
  v_schedule_density jsonb;
  v_peak_times jsonb;
  v_notification_health jsonb;
  v_cancellation_drivers jsonb;
  v_recent_bookings jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Headline cards ---------------------------------------------------------
  select jsonb_build_object(
    'pending', (
      select count(*)::int
      from public.bookings
      where status = 'pending'
    ),
    'approved_upcoming', (
      select count(*)::int
      from public.bookings
      where status = 'approved'
        and booking_date >= v_today
    ),
    'active_venues', (
      select count(*)::int
      from public.venues
      where is_active
    ),
    'failed_notifications', (
      select count(*)::int
      from public.notification_outbox
      where status = 'failed'
    )
  ) into v_summary;

  -- Pending aging ---------------------------------------------------------
  select jsonb_build_object(
    'total', count(*)::int,
    'under_24h', (count(*) filter (
      where created_at > v_now - interval '24 hours'
    ))::int,
    'one_to_three_days', (count(*) filter (
      where created_at <= v_now - interval '24 hours'
        and created_at > v_now - interval '3 days'
    ))::int,
    'over_three_days', (count(*) filter (
      where created_at <= v_now - interval '3 days'
    ))::int
  ) into v_pending_aging
  from public.bookings
  where status = 'pending';

  select coalesce(jsonb_agg(to_jsonb(oldest) order by oldest.created_at), '[]'::jsonb)
  into v_oldest_pending
  from (
    select
      b.id,
      b.reference,
      b.activity_name,
      b.requester_name,
      b.booking_date,
      b.created_at,
      v.name as venue_name,
      round(
        (extract(epoch from (v_now - b.created_at)) / 3600.0)::numeric,
        1
      ) as waited_hours
    from public.bookings b
    left join public.venues v on v.id = b.venue_id
    where b.status = 'pending'
    order by b.created_at
    limit 5
  ) oldest;

  -- Decision turnaround ---------------------------------------------------
  select jsonb_build_object(
    'count', count(*)::int,
    'avg_minutes', round(
      (avg(extract(epoch from (decided_at - created_at))) / 60.0)::numeric,
      1
    ),
    'median_minutes', round(
      (
        percentile_cont(0.5) within group (
          order by extract(epoch from (decided_at - created_at))
        ) / 60.0
      )::numeric,
      1
    )
  ) into v_turnaround_all_time
  from public.bookings
  where decided_at is not null
    and status in ('approved', 'rejected');

  select jsonb_build_object(
    'count', count(*)::int,
    'avg_minutes', round(
      (avg(extract(epoch from (decided_at - created_at))) / 60.0)::numeric,
      1
    ),
    'median_minutes', round(
      (
        percentile_cont(0.5) within group (
          order by extract(epoch from (decided_at - created_at))
        ) / 60.0
      )::numeric,
      1
    )
  ) into v_turnaround_30d
  from public.bookings
  where decided_at >= v_now - interval '30 days'
    and status in ('approved', 'rejected');

  -- Approval funnel / outcome mix ----------------------------------------
  select jsonb_build_object(
    'total', count(*)::int,
    'pending', (count(*) filter (where status = 'pending'))::int,
    'approved', (count(*) filter (where status = 'approved'))::int,
    'rejected', (count(*) filter (where status = 'rejected'))::int,
    'cancelled', (count(*) filter (where status = 'cancelled'))::int,
    'decided', (count(*) filter (
      where status in ('approved', 'rejected')
    ))::int,
    'auto_approved', (count(*) filter (where is_auto_approved))::int,
    'auto_approved_share', case
      when (count(*) filter (where status = 'approved')) = 0 then null
      else round(
        (count(*) filter (where is_auto_approved))::numeric
          / (count(*) filter (where status = 'approved')),
        3
      )
    end,
    'approval_rate', case
      when (count(*) filter (where status in ('approved', 'rejected'))) = 0
        then null
      else round(
        (count(*) filter (where status = 'approved'))::numeric
          / (count(*) filter (where status in ('approved', 'rejected'))),
        3
      )
    end
  ) into v_outcome_mix
  from public.bookings;

  -- Venue utilization -----------------------------------------------------
  select coalesce(
    jsonb_agg(to_jsonb(util) order by util.upcoming_approved desc, util.venue_name),
    '[]'::jsonb
  )
  into v_venue_utilization
  from (
    select
      v.id as venue_id,
      v.name as venue_name,
      v.capacity,
      v.is_active,
      (count(b.id) filter (where b.status = 'approved'))::int
        as upcoming_approved,
      (count(b.id) filter (where b.status = 'pending'))::int
        as upcoming_pending,
      coalesce(
        (sum(b.attendee_count) filter (where b.status = 'approved'))::int,
        0
      ) as upcoming_attendees,
      round(
        avg(
          case
            when b.status = 'approved'
              and b.attendee_count is not null
              and v.capacity > 0
              then least(b.attendee_count, v.capacity)::numeric / v.capacity
          end
        ),
        3
      ) as avg_fill_rate
    from public.venues v
    left join public.bookings b
      on b.venue_id = v.id
      and b.booking_date >= v_today
      and b.status in ('approved', 'pending')
    group by v.id, v.name, v.capacity, v.is_active
  ) util;

  -- Demand trend (last 30 days, zero-filled) ------------------------------
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', (v_today - (29 - g.n))::text,
        'count', coalesce(daily.cnt, 0)
      )
      order by g.n
    ),
    '[]'::jsonb
  )
  into v_demand_trend
  from generate_series(0, 29) as g(n)
  left join (
    select created_at::date as day, count(*)::int as cnt
    from public.bookings
    where created_at >= (v_today - 29)
    group by created_at::date
  ) daily on daily.day = v_today - (29 - g.n);

  -- Schedule density (next 14 days, zero-filled) --------------------------
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', (v_today + g.n)::text,
        'count', coalesce(daily.cnt, 0)
      )
      order by g.n
    ),
    '[]'::jsonb
  )
  into v_schedule_density
  from generate_series(0, 13) as g(n)
  left join (
    select booking_date, count(*)::int as cnt
    from public.bookings
    where booking_date between v_today and v_today + 13
      and status in ('pending', 'approved')
    group by booking_date
  ) daily on daily.booking_date = v_today + g.n;

  -- Peak times (weekday x hour, requests created in the last 90 days) -----
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dow', peak.dow,
        'hour', peak.hour,
        'count', peak.cnt
      )
      order by peak.dow, peak.hour
    ),
    '[]'::jsonb
  )
  into v_peak_times
  from (
    select
      extract(dow from booking_date)::int as dow,
      extract(hour from start_time)::int as hour,
      count(*)::int as cnt
    from public.bookings
    where status in ('pending', 'approved')
      and start_time is not null
      and created_at >= v_now - interval '90 days'
    group by 1, 2
  ) peak;

  -- Notification health ---------------------------------------------------
  select jsonb_build_object(
    'status_counts', jsonb_build_object(
      'total', count(*)::int,
      'pending', (count(*) filter (where status = 'pending'))::int,
      'sent', (count(*) filter (where status = 'sent'))::int,
      'failed', (count(*) filter (where status = 'failed'))::int,
      'cancelled', (count(*) filter (where status = 'cancelled'))::int
    ),
    'pending_backlog', (count(*) filter (where status = 'pending'))::int,
    'failed', (count(*) filter (where status = 'failed'))::int,
    'retries', (count(*) filter (where attempts > 1))::int,
    'total_attempts', coalesce(sum(attempts), 0)::int,
    'sent_last_24h', (count(*) filter (
      where status = 'sent'
        and sent_at >= v_now - interval '24 hours'
    ))::int,
    'oldest_pending_minutes', round(
      (
        max(extract(epoch from (v_now - created_at))) filter (
          where status = 'pending'
        ) / 60.0
      )::numeric,
      1
    ),
    'avg_lag_minutes', (
      select round(
        (avg(extract(epoch from (sent_at - scheduled_for))) / 60.0)::numeric,
        1
      )
      from public.notification_outbox
      where status = 'sent'
        and sent_at is not null
    ),
    'max_lag_minutes', (
      select round(
        (max(extract(epoch from (sent_at - scheduled_for))) / 60.0)::numeric,
        1
      )
      from public.notification_outbox
      where status = 'sent'
        and sent_at is not null
    )
  ) into v_notification_health
  from public.notification_outbox;

  -- Cancellation drivers --------------------------------------------------
  select jsonb_build_object(
    'total', count(*)::int,
    'school_event', (count(*) filter (
      where decision_note ilike 'Cancelled automatically:%'
    ))::int,
    'manual', (count(*) filter (
      where decision_note is null
        or decision_note not ilike 'Cancelled automatically:%'
    ))::int,
    'last_30d_total', (count(*) filter (
      where cancelled_at >= v_now - interval '30 days'
    ))::int,
    'last_30d_school_event', (count(*) filter (
      where cancelled_at >= v_now - interval '30 days'
        and decision_note ilike 'Cancelled automatically:%'
    ))::int,
    'last_30d_manual', (count(*) filter (
      where cancelled_at >= v_now - interval '30 days'
        and (
          decision_note is null
          or decision_note not ilike 'Cancelled automatically:%'
        )
    ))::int
  ) into v_cancellation_drivers
  from public.bookings
  where status = 'cancelled';

  -- Recent requests -------------------------------------------------------
  select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
  into v_recent_bookings
  from (
    select
      b.id,
      b.reference,
      b.public_token,
      b.activity_name,
      b.requester_name,
      b.status,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.created_at,
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
    left join public.venues v on v.id = b.venue_id
    order by b.created_at desc, b.id desc
    limit 5
  ) recent;

  return jsonb_build_object(
    'generated_at', v_now,
    'summary', v_summary,
    'pending_aging', v_pending_aging || jsonb_build_object(
      'oldest', v_oldest_pending
    ),
    'decision_turnaround', jsonb_build_object(
      'all_time', v_turnaround_all_time,
      'last_30_days', v_turnaround_30d
    ),
    'outcome_mix', v_outcome_mix,
    'venue_utilization', v_venue_utilization,
    'demand_trend', v_demand_trend,
    'schedule_density', v_schedule_density,
    'peak_times', v_peak_times,
    'notification_health', v_notification_health,
    'cancellation_drivers', v_cancellation_drivers,
    'recent_bookings', v_recent_bookings
  );
end;
$$;

create or replace function public.get_booker_dashboard(
  p_today date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_today date := coalesce(p_today, current_date);
  v_counts jsonb;
  v_waits jsonb;
  v_most_used_venue jsonb;
  v_attendees jsonb;
  v_next_booking jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*)::int,
    'pending', (count(*) filter (where status = 'pending'))::int,
    'approved', (count(*) filter (where status = 'approved'))::int,
    'rejected', (count(*) filter (where status = 'rejected'))::int,
    'cancelled', (count(*) filter (where status = 'cancelled'))::int,
    'upcoming', (count(*) filter (
      where booking_date >= v_today
        and status in ('pending', 'approved')
    ))::int,
    'approval_rate', case
      when (count(*) filter (where status in ('approved', 'rejected'))) = 0
        then null
      else round(
        (count(*) filter (where status = 'approved'))::numeric
          / (count(*) filter (where status in ('approved', 'rejected'))),
        3
      )
    end
  ) into v_counts
  from public.bookings
  where user_id = v_uid;

  select jsonb_build_object(
    'avg_decision_wait_minutes', round(
      (avg(extract(epoch from (decided_at - created_at))) / 60.0)::numeric,
      1
    ),
    'median_decision_wait_minutes', round(
      (
        percentile_cont(0.5) within group (
          order by extract(epoch from (decided_at - created_at))
        ) / 60.0
      )::numeric,
      1
    ),
    'avg_pending_wait_hours', (
      select round(
        (avg(extract(epoch from (v_now - created_at))) / 3600.0)::numeric,
        1
      )
      from public.bookings
      where user_id = v_uid
        and status = 'pending'
    )
  ) into v_waits
  from public.bookings
  where user_id = v_uid
    and decided_at is not null
    and status in ('approved', 'rejected');

  select to_jsonb(venue_use)
  into v_most_used_venue
  from (
    select
      b.venue_id,
      v.name as venue_name,
      count(*)::int as booking_count
    from public.bookings b
    join public.venues v on v.id = b.venue_id
    where b.user_id = v_uid
    group by b.venue_id, v.name
    order by count(*) desc, v.name
    limit 1
  ) venue_use;

  select jsonb_build_object(
    'total_attendees', coalesce(sum(attendee_count), 0)::int,
    'approved_attendees', coalesce(
      (sum(attendee_count) filter (where status = 'approved'))::int,
      0
    ),
    'upcoming_attendees', coalesce(
      (
        sum(attendee_count) filter (
          where booking_date >= v_today
            and status in ('pending', 'approved')
        )
      )::int,
      0
    )
  ) into v_attendees
  from public.bookings
  where user_id = v_uid;

  select to_jsonb(next_booking)
  into v_next_booking
  from (
    select
      b.id,
      b.reference,
      b.public_token,
      b.activity_name,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.status,
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
    left join public.venues v on v.id = b.venue_id
    where b.user_id = v_uid
      and b.booking_date >= v_today
      and b.status in ('pending', 'approved')
    order by b.booking_date, coalesce(b.start_time, '00:00'::time), b.created_at
    limit 1
  ) next_booking;

  return jsonb_build_object(
    'generated_at', v_now,
    'counts', v_counts,
    'waits', v_waits,
    'most_used_venue', v_most_used_venue,
    'attendees', v_attendees,
    'next_booking', v_next_booking
  );
end;
$$;

revoke all on function public.get_admin_dashboard(date) from public;
grant execute on function public.get_admin_dashboard(date)
  to authenticated, service_role;

revoke all on function public.get_booker_dashboard(date) from public;
grant execute on function public.get_booker_dashboard(date)
  to authenticated, service_role;

revoke all on function public.get_admin_dashboard(date) from anon;
revoke all on function public.get_booker_dashboard(date) from anon;

notify pgrst, 'reload schema';
