const LAST_VISITED_TAB_KEY = "booking:last-visited-tab";

export function isAppTabPath(pathname: string) {
	return (
		pathname === "/admin" ||
		pathname.startsWith("/admin/") ||
		pathname === "/dashboard" ||
		pathname.startsWith("/dashboard/")
	);
}

export function setLastVisitedTab(pathname: string) {
	if (typeof window === "undefined" || !isAppTabPath(pathname)) return;

	try {
		window.localStorage.setItem(LAST_VISITED_TAB_KEY, pathname);
	} catch {
		// Ignore storage failures (private mode, quota, etc.).
	}
}

export function getLastVisitedTab() {
	if (typeof window === "undefined") return null;

	try {
		const pathname = window.localStorage.getItem(LAST_VISITED_TAB_KEY);
		return pathname && isAppTabPath(pathname) ? pathname : null;
	} catch {
		return null;
	}
}

export function getPostAuthPath({
	redirect,
	isAdmin,
}: {
	redirect?: string;
	isAdmin: boolean;
}) {
	const explicitRedirect =
		redirect?.startsWith("/") && !redirect.startsWith("//") ? redirect : null;
	const storedTab = getLastVisitedTab();
	const allowedStoredTab =
		storedTab && (isAdmin || storedTab.startsWith("/dashboard"))
			? storedTab
			: null;

	return explicitRedirect ?? allowedStoredTab ?? "/dashboard";
}
