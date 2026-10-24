import { createFileRoute } from "@tanstack/react-router";
import {
	getAdminRequestUser,
	getServiceRoleClient,
} from "#/lib/admin-auth.server";
import type { AppRole } from "#/lib/types";

function parseRole(value: unknown): AppRole | null {
	return value === "admin" || value === "booker" ? value : null;
}

function parseOptionalString(value: unknown) {
	return typeof value === "string" ? value.trim() : null;
}

function serviceRoleError() {
	return Response.json(
		{
			error:
				"SUPABASE_SERVICE_ROLE_KEY is not configured, so user accounts cannot be changed.",
		},
		{ status: 503 },
	);
}

export const Route = createFileRoute("/api/admin/users")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const adminUser = await getAdminRequestUser(request);
				if (!adminUser) {
					return Response.json(
						{ error: "Administrator access required." },
						{ status: 401 },
					);
				}

				const admin = getServiceRoleClient();
				if (!admin) return serviceRoleError();

				const body = (await request.json().catch(() => null)) as {
					email?: unknown;
					fullName?: unknown;
					role?: unknown;
				} | null;

				const email = parseOptionalString(body?.email);
				const fullName = parseOptionalString(body?.fullName);
				const role = parseRole(body?.role) ?? "booker";

				if (!email || !email.includes("@")) {
					return Response.json(
						{ error: "A valid email is required." },
						{ status: 400 },
					);
				}

				const { data, error } = await admin.auth.admin.inviteUserByEmail(
					email,
					{
						data: fullName ? { full_name: fullName } : undefined,
					},
				);

				if (error) {
					return Response.json({ error: error.message }, { status: 400 });
				}

				if (role === "admin" && data.user) {
					const { error: profileError } = await admin
						.from("profiles")
						.update({ role })
						.eq("id", data.user.id);

					if (profileError) {
						return Response.json(
							{ error: profileError.message },
							{ status: 500 },
						);
					}
				}

				return Response.json({ ok: true, user: { id: data.user?.id, email } });
			},
			PATCH: async ({ request }) => {
				const adminUser = await getAdminRequestUser(request);
				if (!adminUser) {
					return Response.json(
						{ error: "Administrator access required." },
						{ status: 401 },
					);
				}

				const admin = getServiceRoleClient();
				if (!admin) return serviceRoleError();

				const body = (await request.json().catch(() => null)) as {
					id?: unknown;
					full_name?: unknown;
					organization?: unknown;
					phone?: unknown;
					role?: unknown;
					is_active?: unknown;
				} | null;

				const userId = parseOptionalString(body?.id);
				if (!userId) {
					return Response.json(
						{ error: "A user id is required." },
						{ status: 400 },
					);
				}

				const { data: target, error: targetError } = await admin
					.from("profiles")
					.select("id, role, is_active")
					.eq("id", userId)
					.maybeSingle();

				if (targetError) {
					return Response.json({ error: targetError.message }, { status: 500 });
				}
				if (!target) {
					return Response.json({ error: "User not found." }, { status: 404 });
				}

				const nextRole = parseRole(body?.role) ?? target.role;
				const nextActive =
					typeof body?.is_active === "boolean"
						? body.is_active
						: target.is_active;

				const losingAdmin =
					target.role === "admin" && (nextRole !== "admin" || !nextActive);
				if (losingAdmin) {
					if (target.id === adminUser.id) {
						return Response.json(
							{ error: "You cannot remove your own administrator access." },
							{ status: 400 },
						);
					}

					const { count, error: countError } = await admin
						.from("profiles")
						.select("id", { count: "exact", head: true })
						.eq("role", "admin")
						.eq("is_active", true);

					if (countError) {
						return Response.json(
							{ error: countError.message },
							{ status: 500 },
						);
					}
					if ((count ?? 0) <= 1) {
						return Response.json(
							{ error: "At least one active administrator is required." },
							{ status: 400 },
						);
					}
				}

				const update: Record<string, string | boolean> = {};
				if (body?.full_name !== undefined) {
					update.full_name = parseOptionalString(body.full_name) ?? "";
				}
				if (body?.organization !== undefined) {
					update.organization = parseOptionalString(body.organization) ?? "";
				}
				if (body?.phone !== undefined) {
					update.phone = parseOptionalString(body.phone) ?? "";
				}
				if (body?.role !== undefined) update.role = nextRole;
				if (body?.is_active !== undefined) update.is_active = nextActive;

				if (Object.keys(update).length === 0) {
					return Response.json(
						{ error: "No changes supplied." },
						{ status: 400 },
					);
				}

				const { data, error } = await admin
					.from("profiles")
					.update(update)
					.eq("id", userId)
					.select("*")
					.single();

				if (error) {
					return Response.json({ error: error.message }, { status: 400 });
				}

				return Response.json({ ok: true, user: data });
			},
			DELETE: async ({ request }) => {
				const adminUser = await getAdminRequestUser(request);
				if (!adminUser) {
					return Response.json(
						{ error: "Administrator access required." },
						{ status: 401 },
					);
				}

				const admin = getServiceRoleClient();
				if (!admin) return serviceRoleError();

				const userId = new URL(request.url).searchParams.get("id");
				if (!userId) {
					return Response.json(
						{ error: "A user id is required." },
						{ status: 400 },
					);
				}
				if (userId === adminUser.id) {
					return Response.json(
						{ error: "You cannot delete your own account." },
						{ status: 400 },
					);
				}

				const { data: target, error: targetError } = await admin
					.from("profiles")
					.select("id, role, is_active")
					.eq("id", userId)
					.maybeSingle();

				if (targetError) {
					return Response.json({ error: targetError.message }, { status: 500 });
				}
				if (!target) {
					return Response.json({ error: "User not found." }, { status: 404 });
				}

				if (target.role === "admin") {
					const { count, error: countError } = await admin
						.from("profiles")
						.select("id", { count: "exact", head: true })
						.eq("role", "admin")
						.eq("is_active", true);

					if (countError) {
						return Response.json(
							{ error: countError.message },
							{ status: 500 },
						);
					}
					if ((count ?? 0) <= 1) {
						return Response.json(
							{ error: "At least one active administrator is required." },
							{ status: 400 },
						);
					}
				}

				const { error } = await admin.auth.admin.deleteUser(userId);
				if (error) {
					return Response.json({ error: error.message }, { status: 400 });
				}

				return Response.json({ ok: true });
			},
		},
	},
});
