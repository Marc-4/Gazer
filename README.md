# School Activity Booking System

A Single Page Application (SPA) for booking school-related activities. Organizations and individuals can submit booking requests for a specific venue on a specific date, with optional start and end times, while administrators manage and act on those requests.

Roadmap
- [ ] user onboarding
- [ ] spreadsheet import/export
- [ ] 

## Features

### For Bookers
- **Booking Requests**: Submit requests to book a venue for a specific date, with optional start and end times
- **Availability Calendar**: See taken venues, dates, and times before submitting. The calendar shows all venues until one is selected, then follows the selected venue; clicking a date fills the form
- **Authenticated Workspace**: Signed-in users get a dedicated sidebar shell with dashboard statistics and a bookings table
- **Automatic Booking Accounts**: Every booking is linked to an account by requester email. New emails receive an invitation, or a magic sign-in link when the service-role key is not configured
- **Email Notifications**: Receive email updates when the status of a booking request changes (approved/rejected/pending)

### For Administrators
- **Admin Workspace**: A separate authenticated sidebar with dashboard, bookings, venue management, open seasons, school events, users, audit log, and notifications tabs
- **Request Management**: View, approve, or reject booking requests from a centralized admin interface, with database-backed status filters, search, and pagination
- **Manual Bookings**: Create pending or approved bookings on behalf of requesters from the Bookings tab, with the same availability calendar shown in the dialog
- **In-app Admin Notifications**: A bell in the sidebar/topbar shows a red pip for unseen booking requests. Opening it marks them as seen and keeps them until the booking is approved or rejected, at which point the related notification is removed. Clicking a notification opens the booking review dialog
- **Live Updates**: Bookings, audit history, email outbox, and admin notifications use Supabase Realtime, so open views refresh automatically when data changes
- **User Management**: Invite users by unique email, edit profile details, change roles, deactivate accounts, and delete users (requires `SUPABASE_SERVICE_ROLE_KEY`)
- **Audit Log**: Review every booking status change with the booking, venue, actor, note, and timestamp
- **Automatic Email Delivery**: Toggle automatic outbox delivery from the Notifications tab so pending emails send without manual dispatch
- **Venue & Availability Control**: Search, filter, and page venues, and track booking availability in a monthly calendar view
- **School Events**: Reserve a venue for a school event with top priority. Conflicting bookings are cancelled and the venue/date is blocked from new requests. School events may overlap each other at the same venue and date, and the admin list supports database-backed date filters, search, and pagination

### Automation
- **Open Season Mechanic**: When enabled for a defined time period, booking requests are automatically approved if the requested venue and time slot are available, no manual admin action required. Admin open-season cards support state filters, search, and pagination

## How It Works

1. A booker checks the availability calendar, selects a venue, date, and optional times, and submits a booking request. Approved bookings with times hold only that time range; approved bookings without times hold the whole date. Pending requests may overlap until reviewed.
2. The request is stored in Supabase, and a database trigger creates an in-app admin notification for pending requests. The requester email is linked to an existing account, or a new account is invited, so future requests appear in their dashboard.
3. An admin reviews the request and approves or rejects it, unless **open season** is active. During open season, requests that do not conflict with an approved booking are approved automatically.
4. Whenever a request's state changes, the booker is notified by email.

Availability is enforced per venue and time range: approved bookings cannot overlap each other at the same venue, and a new pending request cannot overlap an approved booking. Pending requests may overlap each other until an administrator approves one. If either booking has no start/end time, it reserves the whole date. Administrators can also create **school events**, which take priority over regular bookings: a school event reserves the whole venue/date, cancels conflicting pending/approved bookings, and prevents new bookings for that venue and date. School events may overlap one another at the same venue and date. Deleting an event makes the date bookable again only when no other school event remains, and does not restore bookings that were already cancelled.

## Tech Stack

- **Frontend**: [TanStack Start](https://tanstack.com/start) (React 19, TypeScript), [TanStack Router](https://tanstack.com/router) for file-based routing
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components
- **Backend/Database**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS, etc.)
- **Email Provider**: [Brevo](https://www.brevo.com/) SMTP relay for transactional emails
- **Build Tool**: [Vite](https://vitejs.dev/) with [Nitro](https://nitro.build/) server adapter
- **Linting/Formatting**: [Biome](https://biomejs.dev/)
- **Testing**: [Vitest](https://vitest.dev/) with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) and jsdom

## Getting Started

### Prerequisites
- [Deno](https://deno.com/) 2.9+ (dependencies are installed through Deno)
- A Supabase project with the migrations in `supabase/migrations` applied
- A Brevo account with an SMTP key for transactional emails

### Installation

```bash
deno install
```

### Environment Variables
Copy `.env.example` to `.env` and fill in the values. Required variables:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser + server | Supabase project URL |
| `VITE_SUPABASE_KEY` | Browser + server | Supabase publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service-role key for admin user management and booking invitations; keep server-only. Without it, booking invitations fall back to Supabase magic links |
| `DATABASE_URL` | Email worker | Direct or session-pooler Postgres URL |
| `SMTP_HOST` | Email worker | SMTP relay host; defaults to `smtp-relay.brevo.com` |
| `SMTP_PORT` | Email worker | SMTP port; defaults to `587` |
| `SMTP_SECURE` | Email worker | Set `true` for implicit TLS, typically on port `465` |
| `BREVO_SMTP_LOGIN` | Email worker | Brevo SMTP login, e.g. `...@smtp-brevo.com` |
| `BREVO_SMTP_KEY` | Email worker | Brevo SMTP key |
| `SMTP_USER` / `SMTP_PASS` | Email worker | Generic alternatives to the Brevo-specific credentials |
| `EMAIL_FROM` | Email worker | Verified sender address |
| `EMAIL_FROM_NAME` | Email worker | Sender display name |
| `APP_URL` | Email worker + auth redirects | Public app URL used in email links and Supabase invite/password-reset redirects |
| `NOTIFICATION_WORKER_SECRET` | Email worker | Optional secret for cron/worker calls |

For Brevo, set `BREVO_SMTP_LOGIN` to the SMTP login and `BREVO_SMTP_KEY` to the SMTP key.

### Initial Setup

1. Apply migrations: `deno task db:push` (remote) or `deno task db:reset` (local).
2. Sign up through `/signup`, then promote the first administrator:

```sql
update public.profiles set role = 'admin' where email = 'admin@example.com';
```

3. In Supabase, set **Authentication → URL Configuration → Site URL** to `APP_URL`, and add `${APP_URL}/forgot-password` to the allowed **Redirect URLs**. Invitation and password-reset emails use that page to set a password.
4. Sign in again. The **Admin** link appears for active administrators.
5. Create venues and, optionally, an open season from the admin console.

### Development

```bash
deno task dev
```

The app will be available at `http://localhost:3000`.

### Testing

```bash
deno task test        # Run all tests once
deno task test:watch  # Re-run tests while files change
```

Tests are colocated with their source files using `*.test.ts` or `*.test.tsx`. Vitest is
configured in `vitest.config.ts`, with jest-dom matchers, automatic React Testing Library
cleanup, and browser API stubs in `src/test/setup.ts`.

### Build for Production

```bash
deno task build
deno task preview
```

### Email Worker

Database triggers write booker status emails and admin cancellation emails to
`notification_outbox`. Admin new-booking notifications are handled in-app via
`admin_notifications` instead of email. The admin
**Notifications** page can send them manually, or the **Send emails
automatically** checkbox can enable the server-side scheduled task. When
enabled, Nitro runs `notifications:auto-dispatch` every minute and drains
pending messages. The task runs while the Node server is running; on serverless
presets, call the dispatch endpoint from the platform's cron instead.

Manual and external delivery is handled by `POST /api/notifications/dispatch`,
which accepts either:

- an administrator's Supabase session token (`Authorization: Bearer <token>`), or
- the `x-worker-secret: $NOTIFICATION_WORKER_SECRET` header.

```bash
curl -X POST https://your-app.example.com/api/notifications/dispatch \
  -H "x-worker-secret: $NOTIFICATION_WORKER_SECRET"
```

Add `?retry=1` to requeue failed messages before dispatching. The admin
**Notifications** page exposes the same action and shows delivery history.

## Authentication Shells

Public routes use the marketing header and footer. All `/dashboard` and `/admin` routes use
the authenticated sidebar shell. A full-screen loader is shown while Supabase resolves the
current session, so authenticated users never briefly see the public shell. Signed-in
bookers see Dashboard and Bookings; administrators see Dashboard, Bookings, Venues,
Open seasons, School events, Users, Audit log, and Notifications. The remaining admin tools
are available from the admin dashboard quick actions.

## Project Structure

- `src/routes/` - File-based routes, including the admin console and the email dispatch API
- `src/lib/` - Supabase auth, types, formatting, admin search/pagination queries, email rendering, and outbox worker
- `src/tasks/` - Scheduled Nitro tasks, including automatic email delivery
- `src/components/` - Shared public layout, authenticated sidebar shell, notification bell, pagination controls, and shadcn/ui components
- `src/test/` - Vitest setup and shared test environment configuration
- `supabase/migrations/` - Drizzle-generated schema plus Supabase auth/RLS/RPC objects
- `supabase/seed.sql` - Optional local demo venues

## Routes

- `/` - Public landing page and venue overview
- `/book` - Booking request form
- `/bookings` - Look up a booking by private link, reference code, or token
- `/bookings/$token` - Public status and cancellation page
- `/login`, `/signup` - Account access
- `/forgot-password` - Request a reset link or set a password after an invite/reset link
- `/dashboard` - Authenticated booker dashboard statistics
- `/dashboard/bookings` - Authenticated booker booking table and cancellation
- `/admin` - Authenticated administrator dashboard statistics
- `/admin/bookings` - Approve, reject, and cancel requests
- `/admin/venues` - Venue and availability administration
- `/admin/calendar` - Monthly calendar of school events, bookings, and availability
- `/admin/events` - Create and manage top-priority school events
- `/admin/open-seasons` - Auto-approval windows
- `/admin/users` - Invite, edit, deactivate, and delete users
- `/admin/audit` - Booking status history
- `/admin/notifications` - Email outbox and dispatch controls

## License

Private - All rights reserved.
