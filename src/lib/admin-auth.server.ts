import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl() {
	return (
		process.env.SUPABASE_URL ??
		process.env.VITE_SUPABASE_URL ??
		import.meta.env.VITE_SUPABASE_URL
	);
}

function getAnonKey() {
	return (
		process.env.SUPABASE_ANON_KEY ??
		process.env.VITE_SUPABASE_KEY ??
		import.meta.env.VITE_SUPABASE_KEY
	);
}

export async function getAdminRequestUser(request: Request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;

	const token = authorization.slice("Bearer ".length).trim();
	const url = getSupabaseUrl();
	const key = getAnonKey();
	if (!token || !url || !key) return null;

	const client = createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: `Bearer ${token}` } },
	});

	const {
		data: { user },
		error,
	} = await client.auth.getUser(token);
	if (error || !user) return null;

	const { data: profile } = await client
		.from("profiles")
		.select("role, is_active")
		.eq("id", user.id)
		.maybeSingle();

	if (profile?.role !== "admin" || profile.is_active !== true) return null;
	return user;
}

export function getAnonServerClient() {
	const url = getSupabaseUrl();
	const key = getAnonKey();
	if (!url || !key) return null;

	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

export function getServiceRoleClient() {
	const url = getSupabaseUrl();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) return null;

	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
