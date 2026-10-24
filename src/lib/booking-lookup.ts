const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const referencePattern = /^BK-[0-9A-F]{12}$/i;

function normalize(value: string) {
	const trimmed = value.trim();

	if (uuidPattern.test(trimmed)) {
		return trimmed.toLowerCase();
	}

	if (referencePattern.test(trimmed)) {
		return `BK-${trimmed.slice(3).toUpperCase()}`;
	}

	return null;
}

export function parseBookingLookup(value: string) {
	const direct = normalize(value);
	if (direct) return direct;

	const path = value.trim().split(/[?#]/)[0] ?? "";
	const segment = path.split("/").filter(Boolean).pop() ?? "";

	return normalize(segment);
}
