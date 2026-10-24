export interface EnsureBookingUserResult {
	ok: boolean;
	linked: boolean;
	invited: boolean;
	method?: "invite" | "magic_link" | null;
	email?: string;
	warning?: string | null;
}

export async function ensureBookingUser(
	bookingId: string,
	publicToken: string,
): Promise<EnsureBookingUserResult> {
	const response = await fetch("/api/bookings/ensure-user", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ bookingId, publicToken }),
	});

	const payload = (await response.json().catch(() => null)) as
		| (EnsureBookingUserResult & { error?: string })
		| null;

	if (!response.ok) {
		throw new Error(payload?.error ?? "Unable to prepare the booking account.");
	}

	return (
		payload ?? {
			ok: true,
			linked: false,
			invited: false,
			warning: "Unable to prepare the booking account.",
		}
	);
}

export function bookingUserMessage(result: EnsureBookingUserResult) {
	if (result.warning)
		return { type: "warning" as const, message: result.warning };
	if (result.method === "invite") {
		return {
			type: "success" as const,
			message: `Invitation sent to ${result.email ?? "the requester"}.`,
		};
	}
	if (result.method === "magic_link") {
		return {
			type: "success" as const,
			message: `Sign-in link sent to ${result.email ?? "the requester"}.`,
		};
	}
	return null;
}
