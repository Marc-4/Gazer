import {
	createFileRoute,
	Link,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { buttonVariants } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { useAuth } from "#/lib/auth";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
	const navigate = useNavigate();
	const { user, profile, loading, isAdmin } = useAuth();

	useEffect(() => {
		if (!loading && !user) {
			navigate({ to: "/login", search: { redirect: "/admin" }, replace: true });
		}
	}, [loading, user, navigate]);

	if (loading) {
		return (
			<div className="max-w-2xl space-y-4">
				<Skeleton className="h-9 w-56" />
				<Skeleton className="h-40 rounded-xl" />
			</div>
		);
	}

	if (!user) return null;

	if (!isAdmin) {
		return (
			<div className="mx-auto max-w-xl py-10">
				<Card className="border-border/70 text-center">
					<CardContent className="flex flex-col items-center gap-3 pt-8">
						<span className="grid size-12 place-items-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
							<ShieldAlert className="size-5" />
						</span>
						<h1 className="font-[Fraunces,Georgia,serif] text-2xl font-bold">
							Administrator access required
						</h1>
						<p className="max-w-md text-sm text-muted-foreground">
							Signed in as {profile?.email ?? user.email}, but this account does
							not have administrator access.
						</p>
						<Link
							to="/dashboard"
							className={cn(buttonVariants(), "mt-2 no-underline")}
						>
							Go to my dashboard
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	return <Outlet />;
}
