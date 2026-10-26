import { getAdminRequestUser } from "./admin-auth.server";

export async function authorizeNotificationRequest(request: Request) {
	const secret = process.env.NOTIFICATION_WORKER_SECRET;
	const providedSecret = request.headers.get("x-worker-secret");
	if (secret && providedSecret === secret) {
		return { ok: true, via: "worker-secret" as const };
	}

	const user = await getAdminRequestUser(request);
	if (!user) return { ok: false, via: null };

	return { ok: true, via: "admin" as const };
}
