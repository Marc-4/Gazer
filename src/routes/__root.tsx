import { TanStackDevtools } from "@tanstack/react-devtools";
import {
	createRootRoute,
	HeadContent,
	Scripts,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";
import { AuthenticatedShell } from "#/components/authenticated-shell";
import { SiteFooter } from "#/components/site-footer";
import { SiteHeader } from "#/components/site-header";
import { Toaster } from "#/components/ui/sonner";
import { AuthProvider, useAuth } from "#/lib/auth";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{
				title: "NBSC Activity Booking System",
			},
			{
				name: "description",
				content:
					"Request school venue bookings, track approval status, and manage availability from one place.",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				<ThemeProvider attribute="class" defaultTheme="light" enableSystem>
					<AuthProvider>
						<AppFrame>{children}</AppFrame>
						<Toaster richColors closeButton />
					</AuthProvider>
				</ThemeProvider>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function AppFrame({ children }: { children: ReactNode }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const navigate = useNavigate();
	const { user, loading, isAdmin } = useAuth();

	const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
	const isDashboardRoute =
		pathname === "/dashboard" || pathname.startsWith("/dashboard/");
	const isAppRoute = isAdminRoute || isDashboardRoute;
	const redirectAdminToConsole =
		!loading && Boolean(user) && isAdmin && isDashboardRoute;

	useEffect(() => {
		if (loading) return;

		if (isAppRoute && !user) {
			navigate({
				to: "/login",
				search: { redirect: pathname },
				replace: true,
			});
			return;
		}

		if (redirectAdminToConsole) {
			navigate({
				to: pathname.startsWith("/dashboard/bookings")
					? "/admin/bookings"
					: "/admin",
				replace: true,
			});
		}
	}, [loading, isAppRoute, user, redirectAdminToConsole, pathname, navigate]);

	if (loading || (isAppRoute && (!user || redirectAdminToConsole))) {
		return <FullScreenLoader />;
	}

	if (isAppRoute) {
		return <AuthenticatedShell>{children}</AuthenticatedShell>;
	}

	return (
		<div className="flex min-h-screen flex-col">
			<SiteHeader />
			<main className="flex-1">{children}</main>
			<SiteFooter />
		</div>
	);
}

function FullScreenLoader() {
	return (
		<div className="grid min-h-screen place-items-center bg-[#f3f5fa] px-6 dark:bg-[#071226]">
			<div className="flex flex-col items-center gap-4 text-center">
				<span className="grid size-14 place-items-center rounded-2xl bg-[#0b1f3a] text-[#f0c75e] shadow-lg shadow-[#0b1f3a]/20">
					<CalendarCheck2 className="size-6" />
				</span>
				<div className="flex items-center gap-2 text-sm font-semibold text-[#0b1f3a] dark:text-white">
					<Loader2 className="size-4 animate-spin text-[#2451d8] dark:text-[#f0c75e]" />
					Loading your workspace
				</div>
				<p className="max-w-xs text-xs text-muted-foreground">
					Checking your account and access.
				</p>
			</div>
		</div>
	);
}
