import { createTransport } from "nodemailer";
import type { EmailTemplate } from "./types";

export interface EmailPayload {
	booking_id?: string;
	reference?: string;
	public_token?: string;
	venue_id?: string;
	venue_name?: string;
	booking_date?: string;
	start_time?: string | null;
	end_time?: string | null;
	status?: string;
	activity_name?: string;
	activity_description?: string | null;
	organization_name?: string | null;
	requester_name?: string;
	requester_email?: string;
	requester_phone?: string | null;
	attendee_count?: number | null;
	decision_note?: string | null;
}

interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

function escapeHtml(value: unknown) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function formatDate(value: string | null | undefined) {
	if (!value) return "—";
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

function formatTime(value: string | null | undefined) {
	if (!value) return "—";
	const [hours = "0", minutes = "0"] = value.split(":");
	const date = new Date();
	date.setHours(Number(hours), Number(minutes), 0, 0);
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function formatTimeRange(
	start: string | null | undefined,
	end: string | null | undefined,
) {
	if (!start && !end) return "Not specified";
	if (!start) return `Until ${formatTime(end)}`;
	if (!end) return `From ${formatTime(start)}`;
	return `${formatTime(start)} – ${formatTime(end)}`;
}

function appUrl() {
	return (
		process.env.APP_URL ??
		process.env.VITE_APP_URL ??
		"http://localhost:3000"
	).replace(/\/$/, "");
}

function bookingUrl(payload: EmailPayload) {
	if (!payload.public_token) return appUrl();
	return `${appUrl()}/bookings/${payload.public_token}`;
}

function detailRows(payload: EmailPayload) {
	const rows: Array<[string, string]> = [
		["Reference", payload.reference ?? "—"],
		["Venue", payload.venue_name ?? "—"],
		["Date", formatDate(payload.booking_date)],
		["Time", formatTimeRange(payload.start_time, payload.end_time)],
		["Activity", payload.activity_name ?? "—"],
		["Organization", payload.organization_name || "—"],
		["Requested by", payload.requester_name ?? "—"],
		["Email", payload.requester_email ?? "—"],
		["Phone", payload.requester_phone || "—"],
		[
			"Attendees",
			payload.attendee_count ? String(payload.attendee_count) : "—",
		],
	];

	if (payload.decision_note) {
		rows.push(["Note", payload.decision_note]);
	}

	return rows
		.map(
			([label, value]) => `
				<tr>
					<td style="padding:8px 0;color:#40516d;font-size:13px;width:150px;vertical-align:top;">${escapeHtml(label)}</td>
					<td style="padding:8px 0;color:#0b1f3a;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
				</tr>`,
		)
		.join("");
}

function layout(options: {
	heading: string;
	intro: string;
	payload: EmailPayload;
	footer?: string;
}) {
	const url = bookingUrl(options.payload);
	return `<!doctype html>
<html lang="en">
	<body style="margin:0;padding:32px 16px;background:#f3f5fb;font-family:Manrope,Segoe UI,sans-serif;">
		<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #dfe4f2;border-radius:16px;overflow:hidden;">
			<div style="padding:24px 28px;background:#0b1f3a;color:#ffffff;">
				<div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#f0c75e;">School Activity Booking</div>
				<h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;">${escapeHtml(options.heading)}</h1>
			</div>
			<div style="padding:28px;">
				<p style="margin:0 0 20px;color:#40516d;font-size:15px;line-height:1.6;">${escapeHtml(options.intro)}</p>
				<table style="width:100%;border-collapse:collapse;">${detailRows(options.payload)}</table>
				<a href="${escapeHtml(url)}" style="display:inline-block;margin-top:24px;padding:12px 20px;background:#2451d8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">View booking</a>
				${options.footer ? `<p style="margin:20px 0 0;color:#40516d;font-size:13px;line-height:1.6;">${escapeHtml(options.footer)}</p>` : ""}
			</div>
			<div style="padding:18px 28px;background:#f8f9ff;border-top:1px solid #e5e9f4;color:#5b6b85;font-size:12px;">
				This is an automated message from the NBSC Activity Booking System.
			</div>
		</div>
	</body>
</html>`;
}

function textContent(options: {
	heading: string;
	intro: string;
	payload: EmailPayload;
	footer?: string;
}) {
	const lines = [
		options.heading,
		"",
		options.intro,
		"",
		`Reference: ${options.payload.reference ?? "—"}`,
		`Venue: ${options.payload.venue_name ?? "—"}`,
		`Date: ${formatDate(options.payload.booking_date)}`,
		`Time: ${formatTimeRange(options.payload.start_time, options.payload.end_time)}`,
		`Activity: ${options.payload.activity_name ?? "—"}`,
		`Organization: ${options.payload.organization_name || "—"}`,
		`Requested by: ${options.payload.requester_name ?? "—"}`,
		`Email: ${options.payload.requester_email ?? "—"}`,
		`Phone: ${options.payload.requester_phone || "—"}`,
		`Attendees: ${options.payload.attendee_count ?? "—"}`,
	];
	if (options.payload.decision_note) {
		lines.push(`Note: ${options.payload.decision_note}`);
	}
	lines.push("", `View booking: ${bookingUrl(options.payload)}`);
	if (options.footer) {
		lines.push("", options.footer);
	}
	lines.push(
		"",
		"This is an automated message from the NBSC Activity Booking System.",
	);
	return lines.join("\n");
}

const confirmationFooter =
	"Your request is now pending review. We will email you as soon as an administrator makes a decision.";

export function renderEmail(
	template: EmailTemplate,
	payload: EmailPayload,
): RenderedEmail {
	switch (template) {
		case "admin_new_booking": {
			const heading = "New booking request";
			const intro = `${payload.requester_name ?? "A booker"} submitted a booking request for ${payload.venue_name ?? "a venue"}.`;
			return {
				subject: `New booking request · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({ heading, intro, payload }),
				text: textContent({ heading, intro, payload }),
			};
		}
		case "admin_booking_cancelled": {
			const heading = "Booking cancelled";
			const intro = payload.decision_note
				?.toLowerCase()
				.includes("school event")
				? `A booking for ${payload.venue_name ?? "a venue"} was cancelled automatically because the venue and date are reserved for a school event.`
				: `${payload.requester_name ?? "A booker"} cancelled a booking for ${payload.venue_name ?? "a venue"}.`;
			return {
				subject: `Booking cancelled · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({ heading, intro, payload }),
				text: textContent({ heading, intro, payload }),
			};
		}
		case "booker_booking_approved": {
			const heading =
				payload.status === "approved"
					? "Your booking is approved"
					: "Booking update";
			const intro = `Good news — your booking for ${payload.venue_name ?? "the venue"} has been approved.`;
			return {
				subject: `Booking approved · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({ heading, intro, payload }),
				text: textContent({ heading, intro, payload }),
			};
		}
		case "booker_booking_rejected": {
			const heading = "Your booking was not approved";
			const intro = `Unfortunately your booking request for ${payload.venue_name ?? "the venue"} was rejected.`;
			return {
				subject: `Booking rejected · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({
					heading,
					intro,
					payload,
					footer:
						"If you have questions about this decision, reply to the organizing team.",
				}),
				text: textContent({
					heading,
					intro,
					payload,
					footer:
						"If you have questions about this decision, reply to the organizing team.",
				}),
			};
		}
		case "booker_booking_cancelled": {
			const heading = "Your booking was cancelled";
			const intro = payload.decision_note
				?.toLowerCase()
				.includes("school event")
				? `The booking for ${payload.venue_name ?? "the venue"} has been cancelled because the venue and date are now reserved for a school event.`
				: `The booking for ${payload.venue_name ?? "the venue"} has been cancelled.`;
			return {
				subject: `Booking cancelled · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({ heading, intro, payload }),
				text: textContent({ heading, intro, payload }),
			};
		}
		case "booker_booking_pending": {
			const heading = "We received your booking request";
			const intro = `Thanks, ${payload.requester_name ?? "there"}! Your request for ${payload.venue_name ?? "the venue"} was received.`;
			return {
				subject: `Booking request received · ${payload.reference ?? payload.venue_name ?? ""}`,
				html: layout({
					heading,
					intro,
					payload,
					footer: confirmationFooter,
				}),
				text: textContent({
					heading,
					intro,
					payload,
					footer: confirmationFooter,
				}),
			};
		}
		default: {
			const heading = "Booking update";
			const intro = "There is an update to a booking request.";
			return {
				subject: `Booking update · ${payload.reference ?? ""}`,
				html: layout({ heading, intro, payload }),
				text: textContent({ heading, intro, payload }),
			};
		}
	}
}

interface SendEmailInput {
	to: { email: string; name?: string | null };
	subject: string;
	html: string;
	text: string;
}

export const EMAIL_CONFIG_ERROR =
	"Email delivery is not configured. Set BREVO_SMTP_LOGIN, BREVO_SMTP_KEY, and EMAIL_FROM.";

function emailConfig() {
	const host = process.env.SMTP_HOST ?? "smtp-relay.brevo.com";
	const configuredPort = Number(process.env.SMTP_PORT ?? "587");
	const port =
		Number.isInteger(configuredPort) &&
		configuredPort > 0 &&
		configuredPort <= 65535
			? configuredPort
			: 587;
	const user = process.env.SMTP_USER ?? process.env.BREVO_SMTP_LOGIN;
	const pass = process.env.SMTP_PASS ?? process.env.BREVO_SMTP_KEY;
	const fromEmail = process.env.EMAIL_FROM;
	const fromName = process.env.EMAIL_FROM_NAME ?? "School Activity Booking";

	if (!user || !pass || !fromEmail) {
		throw new Error(EMAIL_CONFIG_ERROR);
	}

	const secure =
		port === 465 ||
		(port !== 587 &&
			(process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1"));

	return {
		host,
		port,
		secure,
		user,
		pass,
		fromEmail,
		fromName,
	};
}

export function isEmailConfigured() {
	try {
		emailConfig();
		return true;
	} catch {
		return false;
	}
}

let transporter: ReturnType<typeof createTransport> | undefined;

function emailTransporter() {
	if (transporter) return transporter;

	const config = emailConfig();
	transporter = createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: { user: config.user, pass: config.pass },
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 20_000,
	});

	return transporter;
}

export async function sendEmail(input: SendEmailInput) {
	const config = emailConfig();
	const info = await emailTransporter().sendMail({
		from: { name: config.fromName, address: config.fromEmail },
		to: {
			name: input.to.name || undefined,
			address: input.to.email,
		},
		subject: input.subject,
		html: input.html,
		text: input.text,
	});

	return { messageId: info.messageId };
}
