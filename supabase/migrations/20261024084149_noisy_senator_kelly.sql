ALTER TABLE "bookings" DROP CONSTRAINT "bookings_time_order";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "end_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order" CHECK ("bookings"."start_time" is null or "bookings"."end_time" is null or "bookings"."end_time" > "bookings"."start_time");