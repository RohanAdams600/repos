-- Phase 7: events and camps, attendance, and the recruiting calendar.

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('SHOWCASE', 'CAMP', 'COMBINE', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecruitingPeriodKind" AS ENUM ('CONTACT', 'EVALUATION', 'QUIET', 'DEAD');

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "EventKind" NOT NULL,
    "sport" "Sport" NOT NULL,
    "organizer" VARCHAR(120) NOT NULL,
    "official_url" VARCHAR(500) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "venue" VARCHAR(120),
    "grad_year_min" SMALLINT,
    "grad_year_max" SMALLINT,
    "cost_text" VARCHAR(80),
    "description" VARCHAR(1000) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" VARCHAR(500),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendance" (
    "event_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "share_with_coaches" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("event_id","athlete_id")
);

-- CreateTable
CREATE TABLE "recruiting_periods" (
    "id" UUID NOT NULL,
    "sport" "Sport" NOT NULL,
    "division" "Division" NOT NULL,
    "kind" "RecruitingPeriodKind" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "source_title" VARCHAR(160) NOT NULL,
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recruiting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_status_start_date_idx" ON "events"("status", "start_date");

-- CreateIndex
CREATE INDEX "events_sport_start_date_idx" ON "events"("sport", "start_date");

-- CreateIndex
CREATE INDEX "events_submitted_by_idx" ON "events"("submitted_by");

-- CreateIndex
CREATE INDEX "event_attendance_athlete_id_idx" ON "event_attendance"("athlete_id");

-- CreateIndex
CREATE INDEX "recruiting_periods_sport_division_start_date_idx" ON "recruiting_periods"("sport", "division", "start_date");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Listings are checked against the organizer's own page, so it must be a real https URL.
ALTER TABLE "events" ADD CONSTRAINT "events_official_url_https" CHECK ("official_url" ~ '^https://[^\s/]+\.[^\s]+$');
ALTER TABLE "events" ADD CONSTRAINT "events_state_code" CHECK ("state" ~ '^[A-Z]{2}$');
ALTER TABLE "events" ADD CONSTRAINT "events_dates" CHECK ("end_date" >= "start_date" AND "end_date" - "start_date" <= 31);
ALTER TABLE "events" ADD CONSTRAINT "events_grad_years" CHECK (("grad_year_min" IS NULL OR "grad_year_min" BETWEEN 2020 AND 2045) AND ("grad_year_max" IS NULL OR "grad_year_max" BETWEEN 2020 AND 2045) AND ("grad_year_min" IS NULL OR "grad_year_max" IS NULL OR "grad_year_min" <= "grad_year_max"));
ALTER TABLE "events" ADD CONSTRAINT "events_text_present" CHECK (length(trim("name")) > 0 AND length(trim("organizer")) > 0 AND length(trim("description")) > 0);
-- Nothing is listed publicly without a staff review on record.
ALTER TABLE "events" ADD CONSTRAINT "events_published_reviewed" CHECK ("status" NOT IN ('PUBLISHED', 'REJECTED') OR ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL));
ALTER TABLE "events" ADD CONSTRAINT "events_canceled_has_date" CHECK (("status" = 'CANCELED') = ("canceled_at" IS NOT NULL));

ALTER TABLE "recruiting_periods" ADD CONSTRAINT "recruiting_periods_source_https" CHECK ("source_url" ~ '^https://[^\s/]+\.[^\s]+$');
ALTER TABLE "recruiting_periods" ADD CONSTRAINT "recruiting_periods_dates" CHECK ("end_date" >= "start_date" AND "end_date" - "start_date" <= 366);
ALTER TABLE "recruiting_periods" ADD CONSTRAINT "recruiting_periods_source_title" CHECK (length(trim("source_title")) > 0);

-- Server-only tables: RLS on with no policies, Data API grants revoked.
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'event_attendance', 'recruiting_periods'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
