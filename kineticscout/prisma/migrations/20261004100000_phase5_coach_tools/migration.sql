-- CreateEnum
CREATE TYPE "CoachVerificationStatus" AS ENUM ('UNSUBMITTED', 'EMAIL_PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'ATHLETE_ACCEPTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'CONTACT_REQUEST';
ALTER TYPE "NotificationKind" ADD VALUE 'CONTACT_UPDATE';
ALTER TYPE "NotificationKind" ADD VALUE 'COACH_VERIFICATION';

-- CreateTable
CREATE TABLE "coach_profiles" (
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "college_id" UUID,
    "work_email" VARCHAR(254),
    "work_email_token_hash" CHAR(64),
    "work_email_token_expires_at" TIMESTAMP(3),
    "work_email_verified_at" TIMESTAMP(3),
    "staff_directory_url" VARCHAR(512),
    "status" "CoachVerificationStatus" NOT NULL DEFAULT 'UNSUBMITTED',
    "review_note" VARCHAR(500),
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "saved_prospects" (
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_prospects_pkey" PRIMARY KEY ("coach_id","athlete_id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
    "guardian_required" BOOLEAN NOT NULL,
    "guardian_token_hash" CHAR(64),
    "guardian_token_expires_at" TIMESTAMP(3),
    "athlete_responded_at" TIMESTAMP(3),
    "guardian_responded_at" TIMESTAMP(3),
    "shared_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_blocks" (
    "athlete_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_blocks_pkey" PRIMARY KEY ("athlete_id","coach_id")
);

-- CreateTable
CREATE TABLE "coach_reports" (
    "id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_work_email_token_hash_key" ON "coach_profiles"("work_email_token_hash");

-- CreateIndex
CREATE INDEX "coach_profiles_status_updated_at_idx" ON "coach_profiles"("status", "updated_at");

-- CreateIndex
CREATE INDEX "coach_profiles_college_id_idx" ON "coach_profiles"("college_id");

-- CreateIndex
CREATE INDEX "saved_prospects_athlete_id_idx" ON "saved_prospects"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_requests_guardian_token_hash_key" ON "contact_requests"("guardian_token_hash");

-- CreateIndex
CREATE INDEX "contact_requests_athlete_id_status_created_at_idx" ON "contact_requests"("athlete_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_requests_coach_id_created_at_idx" ON "contact_requests"("coach_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_requests_status_expires_at_idx" ON "contact_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "coach_reports_resolved_at_created_at_idx" ON "coach_reports"("resolved_at", "created_at");

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "college_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prospects" ADD CONSTRAINT "saved_prospects_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prospects" ADD CONSTRAINT "saved_prospects_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_blocks" ADD CONSTRAINT "coach_blocks_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_blocks" ADD CONSTRAINT "coach_blocks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_reports" ADD CONSTRAINT "coach_reports_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_reports" ADD CONSTRAINT "coach_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written access rules (see init migration for rationale).
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coach_profiles', 'saved_prospects', 'contact_requests', 'coach_blocks', 'coach_reports'] LOOP
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
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_verified_has_review" CHECK ("status" <> 'VERIFIED' OR ("reviewed_at" IS NOT NULL AND "work_email_verified_at" IS NOT NULL AND "college_id" IS NOT NULL));
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_work_email_lowercase" CHECK ("work_email" IS NULL OR "work_email" = lower("work_email"));
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_https_directory" CHECK ("staff_directory_url" IS NULL OR "staff_directory_url" LIKE 'https://%');
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_shared_only_when_accepted" CHECK ("status" = 'ACCEPTED' OR cardinality("shared_emails") = 0);
-- One open request per coach and athlete at a time.
CREATE UNIQUE INDEX "contact_requests_one_open_per_pair" ON "contact_requests" ("coach_id", "athlete_id") WHERE "status" IN ('PENDING', 'ATHLETE_ACCEPTED');
