-- Optional local seed data. Run with `supabase db reset` to apply after migrations.
-- Create an auth user through the app (or Supabase dashboard) first, then promote
-- it to administrator with:
--   update public.profiles set role = 'admin' where email = 'admin@example.com';

insert into public.venues (name, slug, description, address, capacity, is_active)
values
	(
		'Main Auditorium',
		'main-auditorium',
		'Large assembly hall with stage, sound system, and projector.',
		'Building A, Ground floor',
		420,
		true
	),
	(
		'Innovation Lab',
		'innovation-lab',
		'Flexible maker space for workshops, robotics, and science activities.',
		'Building C, Room 204',
		40,
		true
	),
	(
		'Open Courtyard',
		'open-courtyard',
		'Outdoor courtyard suitable for performances, fairs, and sports demos.',
		'Central campus',
		200,
		true
	)
on conflict do nothing;
