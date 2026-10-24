import { createFileRoute } from "@tanstack/react-router";
import {
	getAnonServerClient,
	getServiceRoleClient,
} from "#/lib/admin-auth.server";

interface EnsureBookingRequesterResult {
	linked?: boolean;
	needs_invite?: boolean;
	email?: string;
	full_name?: string | null;
}

function parseString(value: unknown) {
	return typeof value === "string" ? value.trim() : null;
}

function appRedirectTo(request: Request) {
	const base =
		process.env.APP_URL ??
		process.env.VITE_APP_URL ??
		new URL(request.url).origin;
	return `${base.replace(/\/$/, "")}/forgot-password`;
}

function inviteErrorMessage(message: string) {
	if (/already|registered|exists/i.test(message)) {
		return "A user with that email already exists.";
	}
	return message;
}

export const Route = createFileRoute("/api/bookings/ensure-user")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json().catch(() => null)) as {
					bookingId?: unknown;
					publicToken?: unknown;
				} | null;

				const bookingId = parseString(body?.bookingId);
				const publicToken = parseString(body?.publicToken);

				if (!bookingId || !publicToken) {
					return Response.json(
						{ error: "A booking id and public token are required." },
						{ status: 400 },
					);
				}

				const anon = getAnonServerClient();
				if (!anon) {
					return Response.json(
						{ error: "Supabase is not configured." },
						{ status: 503 },
					);
				}

				const { data, error } = await anon.rpc("ensure_booking_requester", {
					p_booking_id: bookingId,
					p_public_token: publicToken,
				});

				if (error) {
					return Response.json({ error: error.message }, { status: 400 });
				}

				const result = (data ?? {}) as EnsureBookingRequesterResult;
				if (result.linked) {
					return Response.json({
						ok: true,
						linked: true,
						invited: false,
						email: result.email,
					});
				}

				const email = result.email?.trim().toLowerCase();
				if (!result.needs_invite || !email) {
					return Response.json(
						{ error: "Unable to determine the booking requester." },
						{ status: 400 },
					);
				}

				const fullName = result.full_name?.trim() || null;
				const redirectTo = appRedirectTo(request);
				const admin = getServiceRoleClient();
				let invited = false;
				let method: "invite" | "magic_link" | null = null;
				let warning: string | null = null;

				if (admin) {
					const { error: inviteError } =
						await admin.auth.admin.inviteUserByEmail(email, {
							data: fullName ? { full_name: fullName } : undefined,
							redirectTo,
						});

					if (inviteError) {
						warning = inviteErrorMessage(inviteError.message);
					} else {
						invited = true;
						method = "invite";
					}
				} else {
					const { error: otpError } = await anon.auth.signInWithOtp({
						email,
						options: {
							shouldCreateUser: true,
							emailRedirectTo: redirectTo,
							data: fullName ? { full_name: fullName } : undefined,
						},
					});

					if (otpError) {
						warning = otpError.message;
					} else {
						invited = true;
						method = "magic_link";
					}
				}

				if (!invited) {
					return Response.json({
						ok: true,
						linked: false,
						invited: false,
						method,
						email,
						warning:
							warning ??
							"The booking was saved, but the account invitation could not be sent.",
					});
				}

				const { data: linkData, error: linkError } = await anon.rpc(
					"ensure_booking_requester",
					{
						p_booking_id: bookingId,
						p_public_token: publicToken,
					},
				);

				if (linkError) {
					return Response.json({
						ok: true,
						linked: false,
						invited,
						method,
						email,
						warning: linkError.message,
					});
				}

				const linked = Boolean(
					(linkData as EnsureBookingRequesterResult | null)?.linked,
				);

				return Response.json({
					ok: true,
					linked,
					invited,
					method,
					email,
					warning: linked
						? null
						: "The account was created, but the booking could not be linked to it yet.",
				});
			},
		},
	},
});
