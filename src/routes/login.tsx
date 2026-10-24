import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useAuth } from "#/lib/auth";
import { supabase } from "#/lib/supabase";

const initialAuthHash =
	typeof window === "undefined" ? "" : window.location.hash;

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>) => {
		const redirect =
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined;
		return { redirect };
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { user, loading } = useAuth();
	const { redirect } = Route.useSearch();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const params = new URLSearchParams(initialAuthHash.replace(/^#/, ""));
		if (!params.get("error")) return;
		setError(
			params.get("error_description") ??
				"This link is invalid or has expired. Request a new one below.",
		);
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
	}, []);

	useEffect(() => {
		if (!loading && user) {
			navigate({ to: redirect ?? "/dashboard", replace: true });
		}
	}, [loading, user, redirect, navigate]);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		setSubmitting(true);

		const { error: authError } = await supabase.auth.signInWithPassword({
			email: email.trim().toLowerCase(),
			password,
		});

		if (authError) {
			setError(authError.message);
			setSubmitting(false);
			return;
		}

		toast.success("Welcome back");
		await navigate({ to: redirect ?? "/dashboard" });
	};

	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
			<div className="hidden lg:block">
				<div className="island-shell rounded-3xl p-8">
					<span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#2451d8] to-[#0b1f3a] text-white">
						<CalendarCheck2 className="size-5" />
					</span>
					<h2 className="mt-5 font-[Fraunces,Georgia,serif] text-3xl font-bold leading-tight">
						Your bookings, all in one place.
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
						Sign in to track requests, cancel bookings, and keep your contact
						details up to date.
					</p>
					<ul className="mt-6 space-y-3 text-sm">
						<li className="flex items-center gap-2">
							<ShieldCheck className="size-4 text-[#2451d8]" />
							Private booking links and account access
						</li>
						<li className="flex items-center gap-2">
							<ShieldCheck className="size-4 text-[#2451d8]" />
							Email updates for every status change
						</li>
						<li className="flex items-center gap-2">
							<ShieldCheck className="size-4 text-[#2451d8]" />
							Administrators can manage everything here
						</li>
					</ul>
				</div>
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-[Fraunces,Georgia,serif] text-2xl">
						Sign in
					</CardTitle>
					<CardDescription>
						Use the email and password for your booking account.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email" required>
								Email
							</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								autoComplete="email"
								required
							/>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-3">
								<Label htmlFor="password" required>
									Password
								</Label>
								<Link
									to="/forgot-password"
									search={{ redirect }}
									className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
								>
									Forgot password?
								</Link>
							</div>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								autoComplete="current-password"
								required
							/>
						</div>
						{error ? (
							<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
								{error}
							</div>
						) : null}
						<Button type="submit" className="w-full" disabled={submitting}>
							<LogIn className="size-4" />
							{submitting ? "Signing in…" : "Sign in"}
						</Button>
					</form>

					<div className="mt-6 space-y-2 border-t border-border pt-4 text-center text-sm text-muted-foreground">
						<p>
							New here?{" "}
							<Link
								to="/signup"
								search={{ redirect }}
								className="font-semibold"
							>
								Create an account
							</Link>
						</p>
						<p className="text-xs">
							You can also{" "}
							<Link to="/book" className="font-semibold">
								submit a request as a guest
							</Link>
							.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
