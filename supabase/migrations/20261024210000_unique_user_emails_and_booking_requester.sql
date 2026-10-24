-- Normalise profile emails so uniqueness is consistently case-insensitive.
update public.profiles
set email = lower(email)
where email is not null
  and email <> lower(email);

create unique index if not exists profiles_email_lower_uidx
  on public.profiles using btree (lower(email))
  where email is not null;

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
    lower(new.email),
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
  set email = lower(new.email)
  where id = new.id;

  return new;
end;
$$;

-- Links a booking to an existing profile by requester email. If the auth user
-- already exists but its profile is missing, the profile is repaired first.
create or replace function public.ensure_booking_requester(
  p_booking_id uuid,
  p_public_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_profile public.profiles;
begin
  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and public_token = p_public_token;

  if not found then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  select *
  into v_profile
  from public.profiles
  where lower(email) = lower(v_booking.requester_email)
  limit 1;

  if v_profile.id is null then
    insert into public.profiles (id, email, full_name)
    select
      u.id,
      lower(u.email),
      nullif(u.raw_user_meta_data ->> 'full_name', '')
    from auth.users u
    where lower(u.email) = lower(v_booking.requester_email)
    limit 1
    on conflict (id) do nothing;

    select *
    into v_profile
    from public.profiles
    where lower(email) = lower(v_booking.requester_email)
    limit 1;
  end if;

  if v_profile.id is not null then
    if v_booking.user_id is null then
      update public.bookings
      set user_id = v_profile.id
      where id = v_booking.id;
    end if;

    return jsonb_build_object(
      'linked', true,
      'needs_invite', false,
      'email', v_booking.requester_email,
      'full_name', v_booking.requester_name
    );
  end if;

  return jsonb_build_object(
    'linked', false,
    'needs_invite', true,
    'email', v_booking.requester_email,
    'full_name', v_booking.requester_name
  );
end;
$$;

revoke all on function public.ensure_booking_requester(uuid, uuid) from public;
grant execute on function public.ensure_booking_requester(uuid, uuid) to anon, authenticated;
