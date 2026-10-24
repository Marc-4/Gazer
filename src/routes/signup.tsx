import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck2, MailCheck, UserPlus } from "lucide-react";
import { useState } from "react";
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
import { supabase } from "#/lib/supabase";

export const Route = createFileRoute("/signup")({
	validateSearch: (search: Record<string, unknown>) => {
		const redirect =
			typeof search.redirect === "string" &&
			search.redirect.startsWith("/") &&
			!search.redirect.startsWith("//")
				? search.redirect
				: undefined;
		return { redirect };
	},
	component: SignupPage,
});

function SignupPage() {
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [organization, setOrganization] = useState("");
	const [phone, setPhone] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [needsConfirmation, setNeedsConfirmation] = useState(false);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		setError(null);

		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}

		setSubmitting(true);
		const { data, error: authError } = await supabase.auth.signUp({
			email: email.trim().toLowerCase(),
			password,
			options: {
				data: {
					full_name: fullName.trim(),
				},
			},
		});

		if (authError) {
			setError(authError.message);
			setSubmitting(false);
			return;
		}

		if (data.user && data.session) {
			const updates = {
				full_name: fullName.trim() || null,
				organization: organization.trim() || null,
				phone: phone.trim() || null,
			};
			const { error: profileError } = await supabase
				.from("profiles")
				.update(updates)
				.eq("id", data.user.id);

			if (profileError) {
				console.error("Unable to save profile details", profileError);
			}

			toast.success("Account created");
			await navigate({ to: redirect ?? "/dashboard" });
			return;
		}

		setNeedsConfirmation(true);
		setSubmitting(false);
	};

	if (needsConfirmation) {
		return (
			<div className="mx-auto w-full max-w-md px-4 py-20 sm:px-6">
				<Card className="border-border/70 text-center">
					<CardHeader>
						<div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
							<MailCheck className="size-5" />
						</div>
						<CardTitle className="mt-2 font-[Fraunces,Georgia,serif] text-2xl">
							Check your email
						</CardTitle>
						<CardDescription>
							We sent a confirmation link to {email}. Confirm your address, then
							sign in.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Link to="/login" search={{ redirect }} className="font-semibold">
							Go to sign in
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
			<div className="hidden lg:block">
				<div className="island-shell rounded-3xl p-8">
					<span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[#2451d8] to-[#0b1f3a] text-white">
						<CalendarCheck2 className="size-5" />
					</span>
					<h2 className="mt-5 font-[Fraunces,Georgia,serif] text-3xl font-bold leading-tight">
						One account, every request.
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
						Create an account to prefill your details, track every request, and
						cancel bookings without digging through email.
					</p>
					<div className="mt-6 rounded-xl border border-border/70 bg-background/60 p-4 text-sm">
						<p className="font-semibold">Booking as an organization?</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							Add your organization and phone number so administrators can reach
							the right person quickly.
						</p>
					</div>
				</div>
			</div>

			<Card className="border-border/70">
				<CardHeader>
					<CardTitle className="font-[Fraunces,Georgia,serif] text-2xl">
						Create an account
					</CardTitle>
					<CardDescription>
						New accounts start with booker access.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="full-name" required>
								Full name
							</Label>
							<Input
								id="full-name"
								value={fullName}
								onChange={(event) => setFullName(event.target.value)}
								autoComplete="name"
								required
							/>
						</div>
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
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="organization">Organization</Label>
								<Input
									id="organization"
									value={organization}
									onChange={(event) => setOrganization(event.target.value)}
									placeholder="Optional"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="phone">Phone</Label>
								<Input
									id="phone"
									type="tel"
									value={phone}
									onChange={(event) => setPhone(event.target.value)}
									autoComplete="tel"
									placeholder="Optional"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="password" required>
								Password
							</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								autoComplete="new-password"
								minLength={8}
								required
							/>
							<p className="text-xs text-muted-foreground">
								At least 8 characters.
							</p>
						</div>
						{error ? (
							<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
								{error}
							</div>
						) : null}
						<Button type="submit" className="w-full" disabled={submitting}>
							<UserPlus className="size-4" />
							{submitting ? "Creating account…" : "Create account"}
						</Button>
					</form>

					<p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link to="/login" search={{ redirect }} className="font-semibold">
							Sign in
						</Link>
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
