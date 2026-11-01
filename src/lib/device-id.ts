const STORAGE_KEY = "nbsc.device-id";

let deviceIdPromise: Promise<string | null> | null = null;

function readStoredValue(storage: Storage | undefined) {
	if (!storage) return null;
	try {
		return storage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStoredValue(storage: Storage | undefined, value: string) {
	if (!storage) return;
	try {
		storage.setItem(STORAGE_KEY, value);
	} catch {
		// Private browsing or storage quotas can reject writes; the fingerprint
		// still works for the current page.
	}
}

function fallbackDeviceId() {
	const existing =
		readStoredValue(window.localStorage) ??
		readStoredValue(window.sessionStorage);
	if (existing) return existing;

	try {
		const id = crypto.randomUUID();
		writeStoredValue(window.localStorage, id);
		return id;
	} catch {
		return null;
	}
}

/**
 * Returns a stable, cookie-less device identifier used for rate limiting.
 *
 * FingerprintJS is loaded lazily so the marketing/auth pages do not pay for it.
 * If fingerprinting is unavailable (privacy settings, blocked scripts), a
 * random id stored in localStorage is used instead.
 */
export function getDeviceId(): Promise<string | null> {
	if (typeof window === "undefined") return Promise.resolve(null);
	if (deviceIdPromise) return deviceIdPromise;

	deviceIdPromise = (async () => {
		const stored =
			readStoredValue(window.sessionStorage) ??
			readStoredValue(window.localStorage);
		if (stored) return stored;

		try {
			const FingerprintJS = (await import("@fingerprintjs/fingerprintjs"))
				.default;
			const agent = await FingerprintJS.load();
			const { visitorId } = await agent.get();
			if (visitorId) {
				writeStoredValue(window.sessionStorage, visitorId);
				writeStoredValue(window.localStorage, visitorId);
				return visitorId;
			}
		} catch (error) {
			console.warn(
				"Device fingerprint unavailable; using a local fallback",
				error,
			);
		}

		return fallbackDeviceId();
	})();

	return deviceIdPromise;
}
