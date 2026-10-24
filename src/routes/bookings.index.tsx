import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";
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
import { parseBookingLookup } from "#/lib/booking-lookup";

export const Route = createFileRoute("/bookings/")({
	component: BookingLookup,
});

function BookingLookup() {
	const navigate = useNavigate();
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		const token = parseBookingLookup(value);

		if (!token) {
			setError("Enter a valid booking link, reference code, or booking token.");
			return;
		}

		setError(null);
		navigate({
			to: "/bookings/$token",
			params: { token },
			search: { created: false },
		});
	};

	return (
		<div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
			<Card className="island-shell border-border/70">
				<CardHeader className="text-center">
					<div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#2451d8]/10 text-[#1c3fae] dark:bg-[#f0c75e]/10 dark:text-[#f0c75e]">
						<Search className="size-5" />
					</div>
					<CardTitle className="mt-2 font-[Fraunces,Georgia,serif] text-2xl">
						Check a booking
					</CardTitle>
					<CardDescription>
						Paste the private link from your confirmation email, or enter the
						booking reference code or token.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="booking-token" required>
								Booking link, reference, or token
							</Label>
							<Input
								id="booking-token"
								value={value}
								onChange={(event) => setValue(event.target.value)}
								placeholder="https://…/bookings/… or BK-48757CB21857"
								required
							/>
							{error ? (
								<p className="text-sm font-medium text-destructive">{error}</p>
							) : null}
						</div>
						<Button type="submit" className="w-full sm:w-auto">
							View booking
							<ArrowRight className="size-4" />
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
