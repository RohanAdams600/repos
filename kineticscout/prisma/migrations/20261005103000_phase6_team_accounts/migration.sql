-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('SELF', 'TEAM');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TeamOrgType" AS ENUM ('HIGH_SCHOOL', 'CLUB');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE', 'DECLINED', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "TeamEntryStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "metrics" ADD COLUMN     "recorded_by" VARCHAR(200),
ADD COLUMN     "source" "MetricSource" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "team_id" UUID;

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "sport" "Sport" NOT NULL,
    "org_type" "TeamOrgType" NOT NULL,
    "organization" VARCHAR(160) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "coach_name" VARCHAR(120) NOT NULL,
    "coach_title" VARCHAR(80) NOT NULL,
    "directory_url" VARCHAR(512) NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" VARCHAR(500),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "join_code" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'REQUESTED',
    "guardian_required" BOOLEAN NOT NULL,
    "guardian_token_hash" CHAR(64),
    "guardian_token_expires_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coach_decided_at" TIMESTAMP(3),
    "guardian_responded_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testing_sessions" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "location" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_entries" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "value" DECIMAL(7,2) NOT NULL,
    "status" "TeamEntryStatus" NOT NULL DEFAULT 'PENDING',
    "metric_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "team_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_join_code_key" ON "teams"("join_code");

-- CreateIndex
CREATE INDEX "teams_coach_id_idx" ON "teams"("coach_id");

-- CreateIndex
CREATE INDEX "teams_status_updated_at_idx" ON "teams"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_guardian_token_hash_key" ON "team_members"("guardian_token_hash");

-- CreateIndex
CREATE INDEX "team_members_team_id_status_idx" ON "team_members"("team_id", "status");

-- CreateIndex
CREATE INDEX "team_members_athlete_id_status_idx" ON "team_members"("athlete_id", "status");

-- CreateIndex
CREATE INDEX "testing_sessions_team_id_date_idx" ON "testing_sessions"("team_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "team_entries_metric_id_key" ON "team_entries"("metric_id");

-- CreateIndex
CREATE INDEX "team_entries_athlete_id_status_idx" ON "team_entries"("athlete_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_entries_session_id_athlete_id_metric_type_key" ON "team_entries"("session_id", "athlete_id", "metric_type");

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testing_sessions" ADD CONSTRAINT "testing_sessions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "testing_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written rules -----------------------------------------------------------------------------

ALTER TABLE "teams" ADD CONSTRAINT "teams_https_directory" CHECK ("directory_url" LIKE 'https://%');
ALTER TABLE "teams" ADD CONSTRAINT "teams_state_code" CHECK ("state" ~ '^[A-Z]{2}$');
ALTER TABLE "teams" ADD CONSTRAINT "teams_join_code_format" CHECK ("join_code" ~ '^[a-hjkmnp-z2-9]{10}$');
ALTER TABLE "teams" ADD CONSTRAINT "teams_verified_has_review" CHECK ("status" <> 'VERIFIED' OR "reviewed_at" IS NOT NULL);

-- A guardian link exists only while a guardian decision is pending.
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_token_only_when_awaiting" CHECK ("status" = 'AWAITING_GUARDIAN' OR "guardian_token_hash" IS NULL);
-- One open or active membership per team and athlete.
CREATE UNIQUE INDEX "team_members_one_open_per_pair" ON "team_members" ("team_id", "athlete_id") WHERE "status" IN ('REQUESTED', 'AWAITING_GUARDIAN', 'ACTIVE');

ALTER TABLE "team_entries" ADD CONSTRAINT "team_entries_metric_only_when_accepted" CHECK ("metric_id" IS NULL OR "status" = 'ACCEPTED');

-- A coach-recorded badge always carries its attribution; a self-logged value carries none.
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_source_attribution" CHECK (
  ("source" = 'SELF' AND "team_id" IS NULL AND "recorded_by" IS NULL) OR ("source" = 'TEAM' AND "recorded_by" IS NOT NULL)
);

-- Server-only tables: RLS on with no policies, Data API grants revoked.
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['teams', 'team_members', 'testing_sessions', 'team_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
