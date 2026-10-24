# School Activity Booking System

A Single Page Application (SPA) for booking school-related activities. Organizations and individuals can submit booking requests for a specific venue on a specific date, while administrators manage and act on those requests.

## Features

### For Bookers
- **Booking Requests**: Submit requests to book a venue for a specific date/time for school-related activities
- **Email Notifications**: Receive email updates when the status of a booking request changes (approved/rejected/pending)

### For Administrators
- **Request Management**: View, approve, or reject booking requests from a centralized admin interface
- **Email Notifications**: Receive email notifications when new booking requests are submitted
- **Venue & Availability Control**: Manage venues and track booking availability

### Automation
- **Open Season Mechanic**: When enabled for a defined time period, booking requests are automatically approved if the requested venue and date combination is available, no manual admin action required

## How It Works

1. A booker selects a venue and date and submits a booking request.
2. The request is stored in Supabase and admins are notified by email.
3. An admin reviews the request and approves or rejects it, unless **open season** is active. During open season, requests that do not conflict with existing bookings are approved automatically.
4. Whenever a request's state changes, the booker is notified by email.

The venue + date combination is the core unit of availability: two active bookings cannot occupy the same venue on the same date.

## Tech Stack

- **Frontend**: [TanStack Start](https://tanstack.com/start) (React 19, TypeScript), [TanStack Router](https://tanstack.com/router) for file-based routing
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) with [shadcn/ui](https://ui.shadcn.com/) components
- **Backend/Database**: [Supabase](https://supabase.com/) (PostgreSQL, Auth, RLS, etc.)
- **Email Provider**: [Brevo](https://www.brevo.com/) for transactional emails
- **Build Tool**: [Vite](https://vitejs.dev/) with [Nitro](https://nitro.build/) server adapter
- **Linting/Formatting**: [Biome](https://biomejs.dev/)

## Getting Started

### Prerequisites
- Node.js (compatible with the dependencies)
- A Supabase project configured
- A Brevo account with API key for transactional emails

### Installation

```bash
npm install
```

### Environment Variables
Create a `.env` file with your configuration (Supabase credentials, Brevo API key, etc.). Refer to your project configuration for required variables.

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

- `src/routes/` - File-based routes (TanStack Router)
- `src/lib/` - Shared utilities and helpers
- `src/components/` - React components (including shadcn/ui components)

## License

Private - All rights reserved.
