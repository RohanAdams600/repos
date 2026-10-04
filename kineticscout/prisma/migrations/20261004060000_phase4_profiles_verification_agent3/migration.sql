-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('AWAITING_UPLOAD', 'CHECKING', 'IN_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationRejection" AS ENUM ('UNREADABLE_FILE', 'DUPLICATE_VIDEO', 'TOO_LONG', 'VALUE_NOT_VISIBLE', 'VALUE_MISMATCH', 'WRONG_EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('COACH_CHANGE', 'ROSTER_NEED', 'METRIC_VERIFIED', 'METRIC_REJECTED');

-- CreateEnum
CREATE TYPE "ProgramChangeKind" AS ENUM ('HEAD_COACH_CHANGED', 'ROSTER_NEED_POSTED');

-- CreateEnum
CREATE TYPE "OutreachTrigger" AS ENUM ('MANUAL', 'COACH_CHANGE', 'ROSTER_NEED');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('EMAIL', 'DM');

-- CreateEnum
CREATE TYPE "ReferenceClipStatus" AS ENUM ('AWAITING_UPLOAD', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "athlete_profiles" ADD COLUMN     "public_show_gpa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_show_school" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_since" TIMESTAMP(3),
ADD COLUMN     "recruiting_alert_emails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recruiting_alerts" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "college_programs" ADD COLUMN     "head_coach_background" VARCHAR(1500),
ADD COLUMN     "recent_season_summary" VARCHAR(600);

-- CreateTable
CREATE TABLE "profile_view_days" (
    "athlete_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "pdf_downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "profile_view_days_pkey" PRIMARY KEY ("athlete_id","day")
);

-- CreateTable
CREATE TABLE "metric_verifications" (
    "metric_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "object_key" VARCHAR(512),
    "content_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64),
    "duration_ms" INTEGER,
    "recorded_at" TIMESTAMP(3),
    "checks" JSONB,
    "rejection_reason" "VerificationRejection",
    "reviewer_note" VARCHAR(500),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "video_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_verifications_pkey" PRIMARY KEY ("metric_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "href" VARCHAR(512),
    "dedupe_key" VARCHAR(128),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_changes" (
    "id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "kind" "ProgramChangeKind" NOT NULL,
    "previous_value" JSONB,
    "new_value" JSONB NOT NULL,
    "source_url" VARCHAR(512),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "program_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_needs" (
    "id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "position" "Position",
    "grad_year" SMALLINT,
    "note" VARCHAR(300) NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_drafts" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "change_id" UUID,
    "trigger" "OutreachTrigger" NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "subject" VARCHAR(160),
    "body" VARCHAR(4000) NOT NULL,
    "facts" JSONB NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "copied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_clips" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "player_name" VARCHAR(120) NOT NULL,
    "level" VARCHAR(40) NOT NULL,
    "motion_type" "MotionType" NOT NULL,
    "handedness" "Handedness" NOT NULL,
    "status" "ReferenceClipStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "object_key" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "pose_data" JSONB,
    "report" JSONB,
    "error_code" VARCHAR(64),
    "licensor" VARCHAR(160) NOT NULL,
    "license_reference" VARCHAR(160) NOT NULL,
    "license_expires_at" TIMESTAMP(3),
    "attribution" VARCHAR(300) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_clips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metric_verifications_object_key_key" ON "metric_verifications"("object_key");

-- CreateIndex
CREATE INDEX "metric_verifications_status_created_at_idx" ON "metric_verifications"("status", "created_at");

-- CreateIndex
CREATE INDEX "metric_verifications_sha256_idx" ON "metric_verifications"("sha256");

-- CreateIndex
CREATE INDEX "metric_verifications_athlete_id_created_at_idx" ON "metric_verifications"("athlete_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "program_changes_processed_at_detected_at_idx" ON "program_changes"("processed_at", "detected_at");

-- CreateIndex
CREATE INDEX "program_changes_college_id_detected_at_idx" ON "program_changes"("college_id", "detected_at" DESC);

-- CreateIndex
CREATE INDEX "roster_needs_college_id_posted_at_idx" ON "roster_needs"("college_id", "posted_at" DESC);

-- CreateIndex
CREATE INDEX "outreach_drafts_athlete_id_created_at_idx" ON "outreach_drafts"("athlete_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_drafts_athlete_id_change_id_key" ON "outreach_drafts"("athlete_id", "change_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_clips_object_key_key" ON "reference_clips"("object_key");

-- CreateIndex
CREATE INDEX "reference_clips_motion_type_handedness_active_status_idx" ON "reference_clips"("motion_type", "handedness", "active", "status");

-- AddForeignKey
ALTER TABLE "profile_view_days" ADD CONSTRAINT "profile_view_days_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_verifications" ADD CONSTRAINT "metric_verifications_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_changes" ADD CONSTRAINT "program_changes_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "college_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_needs" ADD CONSTRAINT "roster_needs_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "college_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "college_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_change_id_fkey" FOREIGN KEY ("change_id") REFERENCES "program_changes"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written access rules (see init migration for rationale).
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profile_view_days', 'metric_verifications', 'notifications', 'program_changes', 'roster_needs', 'outreach_drafts', 'reference_clips'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- Data rules the application also enforces.
ALTER TABLE "profile_view_days" ADD CONSTRAINT "profile_view_days_nonnegative" CHECK ("views" >= 0 AND "pdf_downloads" >= 0);
ALTER TABLE "roster_needs" ADD CONSTRAINT "roster_needs_https_source" CHECK ("source_url" LIKE 'https://%');
ALTER TABLE "reference_clips" ADD CONSTRAINT "reference_clips_license_recorded" CHECK (length(trim("licensor")) > 0 AND length(trim("license_reference")) > 0 AND length(trim("attribution")) > 0);
-- A verified badge must have a recorded reviewer decision.
ALTER TABLE "metric_verifications" ADD CONSTRAINT "metric_verifications_review_recorded" CHECK ("status" NOT IN ('VERIFIED', 'REJECTED') OR "reviewed_at" IS NOT NULL);
