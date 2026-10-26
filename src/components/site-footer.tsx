import { Link } from "@tanstack/react-router"
import { CalendarCheck2 } from "lucide-react"

export function SiteFooter() {
  return (
    <footer className="site-footer mt-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#2451d8] to-[#0b1f3a] text-white">
            <CalendarCheck2 className="size-5" />
          </span>
          <div>
            <p className="font-[Fraunces,Georgia,serif] text-sm font-bold">
              NBSC Activity Booking System
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Book school venues, manage requests, and keep everyone informed
              with automatic email updates.
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/book" className="no-underline hover:text-foreground">
            Request a booking
          </Link>
          <Link to="/bookings" className="no-underline hover:text-foreground">
            Booking status
          </Link>
          <Link to="/dashboard" className="no-underline hover:text-foreground">
            My bookings
          </Link>
          <span className="text-xs">
            GPLv3 · Made by {` `}
            <a target="_blank" rel="noopener" href="https://github.com/Marc-4">MKV</a>
          </span>
        </nav>
      </div>
    </footer>
  )
}
