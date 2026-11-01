-- Claim-then-send support for the notification outbox.
--
-- A worker claims due rows in a short transaction by setting `claimed_at`,
-- then sends the emails outside the transaction. Rows whose claim is older
-- than the lease are considered abandoned and can be claimed again.
alter table public.notification_outbox
  add column if not exists claimed_at timestamptz;

create index if not exists notification_outbox_claim_idx
  on public.notification_outbox (scheduled_for)
  where status = 'pending' and claimed_at is null;

notify pgrst, 'reload schema';
