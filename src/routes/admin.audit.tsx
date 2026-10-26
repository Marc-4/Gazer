import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Eye, History, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { DataPagination } from "#/components/data-pagination"
import { EmptyState } from "#/components/empty-state"
import { FilterSelect } from "#/components/filter-select"
import { PageHeader } from "#/components/page-header"
import { BookingStatusBadge } from "#/components/status-badge"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "#/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Separator } from "#/components/ui/separator"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "#/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
  type AuditLogFilter,
  countAuditLogEntries,
  fetchAuditLogPage,
  fetchVenueOptions,
  type VenueOption
} from "#/lib/admin-queries"
import { formatDate, formatDateTime, formatTimeRange } from "#/lib/format"
import type { AuditLogEntry } from "#/lib/types"
import { useDebouncedValue } from "#/lib/use-debounced-value"
import { useBookingStatusHistoryRealtime } from "#/lib/use-realtime"

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditLog
})

const filters: Array<{ value: AuditLogFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" }
]

function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<AuditLogFilter>("all")
  const [query, setQuery] = useState("")
  const [venueFilter, setVenueFilter] = useState("all")
  const [bookingDateFilter, setBookingDateFilter] = useState("")
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalAll, setTotalAll] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const debouncedQuery = useDebouncedValue(query)

  useEffect(() => {
    let active = true
    fetchVenueOptions()
      .then((options) => {
        if (active) setVenueOptions(options)
      })
      .catch((error: unknown) => {
        if (!active) return
        toast.error(
          error instanceof Error ? error.message : "Unable to load venues."
        )
      })
    return () => {
      active = false
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retriggers the query after realtime changes.
  useEffect(() => {
    let active = true
    setLoading(true)

    Promise.all([
      fetchAuditLogPage({
        page,
        pageSize,
        filter,
        query: debouncedQuery,
        venueId: venueFilter,
        bookingDate: bookingDateFilter
      }),
      countAuditLogEntries()
    ])
      .then(([result, allCount]) => {
        if (!active) return
        const pageCount = Math.max(1, Math.ceil(result.total / pageSize))
        if (page > pageCount) {
          setPage(pageCount)
          return
        }
        setEntries(result.rows)
        setTotal(result.total)
        setTotalAll(allCount)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        toast.error(
          error instanceof Error ? error.message : "Unable to load audit log."
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [
    page,
    pageSize,
    filter,
    debouncedQuery,
    venueFilter,
    bookingDateFilter,
    refreshKey
  ])

  const refresh = () => setRefreshKey((key) => key + 1)
  useBookingStatusHistoryRealtime(refresh)

  return (
    <div>
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Every booking status change, who made it, and when it happened."
      />

      <Card className="mt-6 border-border/70">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-[Fraunces,Georgia,serif] text-xl">
                Status history
              </CardTitle>
              <CardDescription>
                {total} of {totalAll} entries
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search booking, actor, note…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Tabs
              value={filter}
              onValueChange={(value) => {
                setFilter(value as AuditLogFilter)
                setPage(1)
              }}
            >
              <TabsList className="w-full justify-start overflow-x-auto xl:w-auto">
                {filters.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                value={venueFilter}
                onValueChange={(value) => {
                  setVenueFilter(value)
                  setPage(1)
                }}
                options={[
                  { value: "all", label: "All venues" },
                  ...venueOptions.map((venue) => ({
                    value: venue.id,
                    label: venue.name
                  }))
                ]}
                ariaLabel="Filter audit log by venue"
              />
              <Input
                type="date"
                value={bookingDateFilter}
                onChange={(event) => {
                  setBookingDateFilter(event.target.value)
                  setPage(1)
                }}
                aria-label="Filter audit log by booking date"
                className="w-full sm:w-44"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {["s1", "s2", "s3", "s4", "s5", "s6"].map((key) => (
                <Skeleton key={key} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyState
              icon={History}
              title="No audit entries found"
              description={
                totalAll === 0
                  ? "Status changes will appear here as bookings are reviewed."
                  : "Try a different filter or search term."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Booking date</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Changed by</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <Link
                          to="/admin/bookings"
                          search={{ review: entry.booking_id }}
                          className="font-mono text-xs font-semibold text-foreground underline-offset-4 hover:underline"
                        >
                          {entry.reference}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {entry.activity_name} · {entry.requester_name}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          to="/admin/calendar"
                          search={{ date: entry.booking_date }}
                          className="block underline-offset-4 hover:underline"
                        >
                          <p className="text-sm">
                            {formatDate(entry.booking_date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeRange(entry.start_time, entry.end_time)}
                          </p>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-sm">
                        {entry.venue_id && entry.venue_name ? (
                          <Link
                            to="/admin/venues"
                            search={{ venue: entry.venue_id }}
                            className="underline-offset-4 hover:underline"
                          >
                            {entry.venue_name}
                          </Link>
                        ) : (
                          (entry.venue_name ?? "Unknown")
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {entry.from_status ? (
                            <BookingStatusBadge status={entry.from_status} />
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">
                              Created
                            </span>
                          )}
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <BookingStatusBadge status={entry.to_status} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <p className="truncate text-sm">
                          {entry.changed_by_name ??
                            entry.changed_by_email ??
                            "System"}
                        </p>
                        {entry.changed_by_email && entry.changed_by_name ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {entry.changed_by_email}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                        {entry.note || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => setSelectedEntry(entry)}
                        >
                          <Eye />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && total > 0 ? (
            <DataPagination
              page={page}
              pageSize={pageSize}
              total={total}
              itemLabel="entries"
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedEntry)}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {selectedEntry ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="font-mono text-sm">
                    {selectedEntry.reference}
                  </DialogTitle>
                  <BookingStatusBadge status={selectedEntry.booking_status} />
                </div>
                <DialogDescription>
                  Status change recorded{" "}
                  {formatDateTime(selectedEntry.created_at)}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h3 className="font-[Fraunces,Georgia,serif] text-xl font-bold">
                    {selectedEntry.activity_name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Requested by {selectedEntry.requester_name}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Status change
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {selectedEntry.from_status ? (
                      <BookingStatusBadge status={selectedEntry.from_status} />
                    ) : (
                      <span className="text-xs font-semibold text-muted-foreground">
                        Created
                      </span>
                    )}
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <BookingStatusBadge status={selectedEntry.to_status} />
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Booking date &amp; time
                    </p>
                    <Link
                      to="/admin/calendar"
                      search={{ date: selectedEntry.booking_date }}
                      className="mt-1 block font-medium underline-offset-4 hover:underline"
                    >
                      {formatDate(selectedEntry.booking_date)}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeRange(
                        selectedEntry.start_time,
                        selectedEntry.end_time
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Venue
                    </p>
                    {selectedEntry.venue_id && selectedEntry.venue_name ? (
                      <Link
                        to="/admin/venues"
                        search={{ venue: selectedEntry.venue_id }}
                        className="mt-1 block font-medium underline-offset-4 hover:underline"
                      >
                        {selectedEntry.venue_name}
                      </Link>
                    ) : (
                      <p className="mt-1 font-medium">
                        {selectedEntry.venue_name ?? "Unknown"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Changed by
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedEntry.changed_by_name ??
                        selectedEntry.changed_by_email ??
                        "System"}
                    </p>
                    {selectedEntry.changed_by_email &&
                    selectedEntry.changed_by_name ? (
                      <p className="text-xs text-muted-foreground">
                        {selectedEntry.changed_by_email}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Audit entry
                    </p>
                    <p className="mt-1 font-mono text-xs">
                      #{selectedEntry.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Booking {selectedEntry.reference}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/50 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Note
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {selectedEntry.note || "No note recorded."}
                  </p>
                </div>

                <Link
                  to="/admin/bookings"
                  search={{ review: selectedEntry.booking_id }}
                  className="inline-flex text-sm font-semibold underline-offset-4 hover:underline"
                >
                  Open booking
                </Link>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedEntry(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
