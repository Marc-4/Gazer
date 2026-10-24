import { Link, useNavigate } from "@tanstack/react-router";
import {
	CalendarCheck2,
	LayoutDashboard,
	LogIn,
	LogOut,
	Menu,
	ShieldCheck,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "#/components/ui/sheet";
import { useAuth } from "#/lib/auth";
import { cn } from "#/lib/utils";

const navItems = [
	{ to: "/", label: "Home" },
	{ to: "/book", label: "Book a venue" },
	{ to: "/bookings", label: "Booking status" },
];

function Brand() {
	return (
		<Link to="/" className="group flex items-center gap-2.5 no-underline">
			<span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#2451d8] to-[#0b1f3a] text-white shadow-sm">
				<CalendarCheck2 className="size-5" />
			</span>
			<span className="flex flex-col leading-tight">
				<span className="font-[Fraunces,Georgia,serif] text-[15px] font-bold text-foreground">
					NBSC Activity Booking System
				</span>
				<span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
					Reserve · Review · Confirm
				</span>
			</span>
		</Link>
	);
}

export function SiteHeader() {
	const { user, profile, isAdmin, loading, signOut } = useAuth();
	const navigate = useNavigate();
	const [mobileOpen, setMobileOpen] = useState(false);

	const handleSignOut = async () => {
		await signOut();
		setMobileOpen(false);
		await navigate({ to: "/" });
	};

	return (
		<header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-xl">
			<div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
				<Brand />

				<nav className="hidden items-center gap-7 md:flex">
					{navItems.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeOptions={{ exact: item.to === "/" }}
							className="nav-link text-sm font-semibold"
							activeProps={{
								className: "nav-link is-active text-sm font-semibold",
							}}
						>
							{item.label}
						</Link>
					))}
					{user ? (
						<Link
							to={isAdmin ? "/admin" : "/dashboard"}
							className="nav-link text-sm font-semibold"
							activeProps={{
								className: "nav-link is-active text-sm font-semibold",
							}}
						>
							Dashboard
						</Link>
					) : null}
				</nav>

				<div className="flex items-center gap-1.5">
					<ThemeToggle />
					{loading ? (
						<div className="hidden h-9 w-24 animate-pulse rounded-md bg-muted sm:block" />
					) : user ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="hidden sm:flex">
									<span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
										{(profile?.full_name ?? user.email ?? "U")
											.slice(0, 1)
											.toUpperCase()}
									</span>
									<span className="max-w-32 truncate">
										{profile?.full_name ?? user.email}
									</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuLabel className="truncate">
									{user.email}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild>
									<Link
										to={isAdmin ? "/admin/bookings" : "/dashboard/bookings"}
										className="no-underline"
									>
										<LayoutDashboard className="size-4" />
										{isAdmin ? "Bookings" : "My bookings"}
									</Link>
								</DropdownMenuItem>
								{isAdmin ? (
									<DropdownMenuItem asChild>
										<Link to="/admin" className="no-underline">
											<ShieldCheck className="size-4" />
											Admin console
										</Link>
									</DropdownMenuItem>
								) : null}
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={handleSignOut}>
									<LogOut className="size-4" />
									Sign out
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : (
						<div className="hidden items-center gap-2 sm:flex">
							<Link
								to="/login"
								search={{ redirect: undefined }}
								className={cn(
									buttonVariants({ variant: "ghost", size: "sm" }),
									"no-underline",
								)}
							>
								<LogIn className="size-4" />
								Sign in
							</Link>
							<Link
								to="/signup"
								search={{ redirect: undefined }}
								className={cn(buttonVariants({ size: "sm" }), "no-underline")}
							>
								<UserPlus className="size-4" />
								Create account
							</Link>
						</div>
					)}

					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="md:hidden"
								aria-label="Open navigation"
							>
								<Menu className="size-5" />
							</Button>
						</SheetTrigger>
						<SheetContent side="right" className="w-72">
							<SheetHeader>
								<SheetTitle>Menu</SheetTitle>
							</SheetHeader>
							<div className="flex flex-col gap-1 px-4">
								{navItems.map((item) => (
									<Link
										key={item.to}
										to={item.to}
										onClick={() => setMobileOpen(false)}
										className="rounded-md px-3 py-2 text-sm font-semibold text-foreground no-underline hover:bg-accent"
									>
										{item.label}
									</Link>
								))}
								{user ? (
									<>
										<Link
											to={isAdmin ? "/admin" : "/dashboard"}
											onClick={() => setMobileOpen(false)}
											className="rounded-md px-3 py-2 text-sm font-semibold text-foreground no-underline hover:bg-accent"
										>
											Dashboard
										</Link>
										<button
											type="button"
											onClick={handleSignOut}
											className="mt-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
										>
											Sign out
										</button>
									</>
								) : (
									<div className="mt-3 grid gap-2 border-t border-border pt-3">
										<Link
											to="/login"
											search={{ redirect: undefined }}
											onClick={() => setMobileOpen(false)}
											className={cn(
												buttonVariants({ variant: "outline" }),
												"no-underline",
											)}
										>
											Sign in
										</Link>
										<Link
											to="/signup"
											search={{ redirect: undefined }}
											onClick={() => setMobileOpen(false)}
											className={cn(buttonVariants(), "no-underline")}
										>
											Create account
										</Link>
									</div>
								)}
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
}
