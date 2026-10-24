import { Link, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Building2,
	CalendarClock,
	CalendarDays,
	CalendarPlus,
	ExternalLink,
	History,
	LayoutDashboard,
	LockOpen,
	LogOut,
	MailWarning,
	School,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { AdminNotificationBell } from "#/components/admin-notification-bell";
import { useAuth } from "#/lib/auth";

type AppNavItem = {
	to:
		| "/dashboard"
		| "/dashboard/bookings"
		| "/admin"
		| "/admin/audit"
		| "/admin/bookings"
		| "/admin/calendar"
		| "/admin/events"
		| "/admin/notifications"
		| "/admin/open-seasons"
		| "/admin/users"
		| "/admin/venues";
	label: string;
	icon: LucideIcon;
	exact?: boolean;
};

const bookerNav: AppNavItem[] = [
	{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
	{ to: "/dashboard/bookings", label: "Bookings", icon: CalendarClock },
];

const adminNav: AppNavItem[] = [
	{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
	{ to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
	{ to: "/admin/bookings", label: "Bookings", icon: CalendarClock },
	{ to: "/admin/venues", label: "Venues", icon: Building2 },
	{ to: "/admin/open-seasons", label: "Open seasons", icon: LockOpen },
	{ to: "/admin/events", label: "School events", icon: School },
	{ to: "/admin/users", label: "Users", icon: Users },
	{ to: "/admin/audit", label: "Audit log", icon: History },
	{ to: "/admin/notifications", label: "Outbox", icon: MailWarning },
];

const navClass =
	"flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/10 hover:text-white";
const navActiveClass =
	"flex shrink-0 items-center gap-2.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white no-underline shadow-[inset_2px_0_0_0_#f0c75e]";
const footerLinkClass =
	"flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white no-underline transition-colors hover:bg-white/10 hover:text-white";

export function AuthenticatedShell({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const { user, profile, isAdmin, signOut } = useAuth();
	const navItems = isAdmin ? adminNav : bookerNav;
	const home = isAdmin ? "/admin" : "/dashboard";
	const initial = (profile?.full_name ?? user?.email ?? "U")
		.charAt(0)
		.toUpperCase();

	const handleSignOut = async () => {
		await signOut();
		await navigate({ to: "/" });
	};

	return (
		<div className="flex min-h-screen flex-col bg-[#f3f5fa] text-foreground dark:bg-[#071226] lg:grid lg:grid-cols-[262px_minmax(0,1fr)]">
			<aside className="hidden bg-[#0b1f3a] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
				<Link
					to={home}
					className="flex items-center gap-3 border-b border-white/10 px-5 py-5 no-underline"
				>
					<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f0c75e] text-[#0b1f3a]">
						<School className="size-5" />
					</span>
					<span className="min-w-0 leading-tight">
						<span className="block truncate font-[Fraunces,Georgia,serif] text-sm font-bold text-white">
							NBSC Activity Booking System
						</span>
						<span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#f0c75e]">
							{isAdmin ? "Admin console" : "Booker workspace"}
						</span>
					</span>
				</Link>

				<nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
					<p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
						Menu
					</p>
					{navItems.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeOptions={{ exact: item.exact ?? false }}
							className={navClass}
							activeProps={{ className: navActiveClass }}
						>
							<item.icon className="size-4 shrink-0" />
							{item.label}
						</Link>
					))}
				</nav>

				<div className="border-t border-white/10 p-3">
					<div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
						<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f0c75e] text-xs font-bold text-[#0b1f3a]">
							{initial}
						</span>
						<div className="min-w-0 flex-1">
							<p className="truncate text-xs font-semibold text-white">
								{profile?.full_name ?? "Signed in"}
							</p>
							<p className="truncate text-[10px] text-white/50">
								{profile?.email ?? user?.email}
							</p>
						</div>
						{isAdmin ? <AdminNotificationBell /> : null}
					</div>
					<div className="mt-2 space-y-1">
						<Link to="/" className={footerLinkClass}>
							<ExternalLink className="size-3.5" />
							Public site
						</Link>
						<button
							type="button"
							onClick={handleSignOut}
							className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-white transition-colors hover:bg-white/10 hover:text-white"
						>
							<LogOut className="size-3.5" />
							Sign out
						</button>
					</div>
				</div>
			</aside>

			<div className="flex min-h-screen min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-40 bg-[#0b1f3a] text-white lg:hidden">
					<div className="flex h-14 items-center justify-between gap-3 px-4">
						<Link
							to={home}
							className="flex min-w-0 items-center gap-2 no-underline"
						>
							<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f0c75e] text-[#0b1f3a]">
								<School className="size-4" />
							</span>
							<span className="truncate font-[Fraunces,Georgia,serif] text-sm font-bold text-white">
								{isAdmin ? "Admin console" : "Booker workspace"}
							</span>
						</Link>
						<div className="flex items-center gap-1">
							{isAdmin ? <AdminNotificationBell /> : null}
							<Link
								to="/book"
								aria-label="New request"
								className="grid size-8 place-items-center rounded-lg text-white no-underline transition-colors hover:bg-white/10 hover:text-white"
							>
								<CalendarPlus className="size-4" />
							</Link>
							<button
								type="button"
								onClick={handleSignOut}
								aria-label="Sign out"
								className="grid size-8 place-items-center rounded-lg text-white transition-colors hover:bg-white/10 hover:text-white"
							>
								<LogOut className="size-4" />
							</button>
						</div>
					</div>
					<nav className="flex gap-1 overflow-x-auto px-3 pb-2">
						{navItems.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								activeOptions={{ exact: item.exact ?? false }}
								className={navClass}
								activeProps={{ className: navActiveClass }}
							>
								<item.icon className="size-4 shrink-0" />
								{item.label}
							</Link>
						))}
					</nav>
				</header>

				<main className="min-w-0 flex-1">
					<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
						{children}
					</div>
				</main>
			</div>
		</div>
	);
}
