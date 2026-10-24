import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, KeyRound, Loader2, MailCheck } from "lucide-react";
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

export const Route = createFileRoute("/forgot-password")({
	validateSearch: (search: Record<string, unknown>) => {
		const redirect =
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined;
		return { redirect };
	},
	component: ForgotPasswordPage,
});

const initialAuthHash =
	typeof window === "undefined" ? "" : window.location.hash;

function ForgotPasswordPage() {
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	const { user, loading } = useAuth();
	const [linkError, setLinkError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const params = new URLSearchParams(initialAuthHash.replace(/^#/, ""));
		if (!params.get("error")) return;
		setLinkError(
			params.get("error_description") ?? "This link is invalid or has expired.",
		);
		window.history.replaceState(
			null,
			"",
			`${window.location.pathname}${window.location.search}`,
		);
	}, []);

	const handleRequestReset = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);
		setSubmitting(true);

		const target = new URL("/forgot-password", window.location.origin);

		const { error: resetError } = await supabase.auth.resetPasswordForEmail(
			email.trim().toLowerCase(),
			{ redirectTo: target.toString() },
		);

		setSubmitting(false);

		if (resetError) {
			setError(resetError.message);
			return;
		}

		setLinkError(null);
		setSent(true);
	};

	const handleUpdatePassword = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);

		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		if (password !== confirmPassword) {
			setError("Passwords do not match.");
			return;
		}

		setSubmitting(true);
		const { error: updateError } = await supabase.auth.updateUser({ password });
		setSubmitting(false);

		if (updateError) {
			setError(updateError.message);
			return;
		}

		toast.success("Password updated");
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
						Get back to your bookings.
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
						Set a password for your booking account, then sign in to track
						requests and manage your reservations.
					</p>
					<div className="mt-6 flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 p-4 text-sm">
						<KeyRound className="mt-0.5 size-4 shrink-0 text-[#2451d8]" />
						<p className="text-xs leading-relaxed text-muted-foreground">
							Invitation and password reset links are single-use and expire for
							security. If yours has expired, request a new one.
						</p>
					</div>
				</div>
			</div>

			<Card className="border-border/70">
				{loading ? (
					<>
						<CardHeader>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-2xl">
								Checking your link
							</CardTitle>
							<CardDescription>
								Please wait while we verify your account link.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Verifying…
						</CardContent>
					</>
				) : sent ? (
					<>
						<CardHeader className="text-center">
							<div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
								<MailCheck className="size-5" />
							</div>
							<CardTitle className="mt-2 font-[Fraunces,Georgia,serif] text-2xl">
								Check your email
							</CardTitle>
							<CardDescription>
								We sent a password reset link to {email}. Open it to choose a
								new password.
							</CardDescription>
						</CardHeader>
						<CardContent className="text-center">
							<Link to="/login" search={{ redirect }} className="font-semibold">
								Back to sign in
							</Link>
						</CardContent>
					</>
				) : user ? (
					<>
						<CardHeader>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-2xl">
								Set a new password
							</CardTitle>
							<CardDescription>
								Choose a password for {user.email ?? "your booking account"}.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleUpdatePassword} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="new-password" required>
										New password
									</Label>
									<Input
										id="new-password"
										type="password"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										autoComplete="new-password"
										minLength={8}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="confirm-password" required>
										Confirm password
									</Label>
									<Input
										id="confirm-password"
										type="password"
										value={confirmPassword}
										onChange={(event) => setConfirmPassword(event.target.value)}
										autoComplete="new-password"
										minLength={8}
										required
									/>
								</div>
								{error ? (
									<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
										{error}
									</div>
								) : null}
								<Button type="submit" className="w-full" disabled={submitting}>
									<KeyRound className="size-4" />
									{submitting ? "Saving…" : "Save password"}
								</Button>
							</form>
						</CardContent>
					</>
				) : (
					<>
						<CardHeader>
							<CardTitle className="font-[Fraunces,Georgia,serif] text-2xl">
								Forgot password
							</CardTitle>
							<CardDescription>
								Enter your email and we&apos;ll send you a link to set a new
								password.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleRequestReset} className="space-y-4">
								{linkError ? (
									<div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
										{linkError}. Request a new link below.
									</div>
								) : null}
								<div className="space-y-2">
									<Label htmlFor="reset-email" required>
										Email
									</Label>
									<Input
										id="reset-email"
										type="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										autoComplete="email"
										required
									/>
								</div>
								{error ? (
									<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
										{error}
									</div>
								) : null}
								<Button type="submit" className="w-full" disabled={submitting}>
									<MailCheck className="size-4" />
									{submitting ? "Sending…" : "Send reset link"}
								</Button>
							</form>
						</CardContent>
					</>
				)}

				<div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
					<Link to="/login" search={{ redirect }} className="font-semibold">
						Back to sign in
					</Link>
				</div>
			</Card>
		</div>
	);
}
