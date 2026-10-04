-- Phase 7: drill library and training plans.

-- CreateEnum
CREATE TYPE "DrillStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "DrillSource" AS ENUM ('STAFF', 'LICENSED');

-- CreateEnum
CREATE TYPE "TrainingPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "drills" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "sport" "Sport" NOT NULL,
    "motion_types" "MotionType"[],
    "focus_codes" TEXT[],
    "summary" VARCHAR(300) NOT NULL,
    "steps" TEXT[],
    "equipment" VARCHAR(200),
    "minutes" SMALLINT NOT NULL,
    "safety_note" VARCHAR(300) NOT NULL,
    "source" "DrillSource" NOT NULL,
    "author" VARCHAR(160) NOT NULL,
    "licensor" VARCHAR(160),
    "licence_ref" VARCHAR(200),
    "licence_expires_at" DATE,
    "status" "DrillStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "reviewed_by" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "analysis_id" UUID,
    "motion_type" "MotionType" NOT NULL,
    "focus_codes" TEXT[],
    "metric_type" "MetricType",
    "baseline_value" DECIMAL(7,2),
    "baseline_date" DATE,
    "status" "TrainingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plan_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "drill_id" UUID NOT NULL,
    "focus_code" VARCHAR(40) NOT NULL,
    "times_per_week" SMALLINT NOT NULL,
    "position" SMALLINT NOT NULL,

    CONSTRAINT "training_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_logs" (
    "item_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_logs_pkey" PRIMARY KEY ("item_id","day")
);

-- CreateIndex
CREATE INDEX "drills_status_sport_idx" ON "drills"("status", "sport");

-- CreateIndex
CREATE INDEX "training_plans_athlete_id_status_idx" ON "training_plans"("athlete_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_plan_items_plan_id_drill_id_key" ON "training_plan_items"("plan_id", "drill_id");

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "video_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_items" ADD CONSTRAINT "training_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plan_items" ADD CONSTRAINT "training_plan_items_drill_id_fkey" FOREIGN KEY ("drill_id") REFERENCES "drills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_logs" ADD CONSTRAINT "training_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "training_plan_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drills: focus codes are the analysis finding codes; 1 to 8 steps; sensible length.
ALTER TABLE "drills" ADD CONSTRAINT "drills_focus_codes" CHECK (cardinality("focus_codes") BETWEEN 1 AND 6 AND "focus_codes" <@ ARRAY['TRUNK_LEADS_PELVIS', 'ARM_LEADS_TRUNK', 'HAND_LEADS_ARM', 'LOW_HIP_SHOULDER_SEPARATION', 'SEGMENTS_FIRE_TOGETHER', 'NO_SPEED_GAIN_PELVIS_TO_TRUNK']::text[]);
ALTER TABLE "drills" ADD CONSTRAINT "drills_motion_types" CHECK (cardinality("motion_types") BETWEEN 1 AND 4);
ALTER TABLE "drills" ADD CONSTRAINT "drills_steps" CHECK (cardinality("steps") BETWEEN 1 AND 8);
ALTER TABLE "drills" ADD CONSTRAINT "drills_minutes" CHECK ("minutes" BETWEEN 5 AND 60);
ALTER TABLE "drills" ADD CONSTRAINT "drills_text_present" CHECK (length(trim("title")) > 0 AND length(trim("summary")) > 0 AND length(trim("safety_note")) > 0 AND length(trim("author")) > 0);
-- Licensed drills carry their licence; staff drills do not pretend to.
ALTER TABLE "drills" ADD CONSTRAINT "drills_licence" CHECK (("source" = 'LICENSED') = ("licensor" IS NOT NULL AND "licence_ref" IS NOT NULL));
-- Two people: a published drill was reviewed by someone other than its writer.
ALTER TABLE "drills" ADD CONSTRAINT "drills_published_reviewed" CHECK ("status" = 'DRAFT' OR ("published_at" IS NOT NULL AND "reviewed_by" IS NOT NULL AND ("created_by" IS NULL OR "reviewed_by" <> "created_by")));

ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_dates" CHECK ("ends_on" > "starts_on" AND "ends_on" - "starts_on" <= 56);
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_archived" CHECK (("status" = 'ARCHIVED') = ("archived_at" IS NOT NULL));
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_baseline" CHECK (("baseline_value" IS NULL) = ("baseline_date" IS NULL) AND ("baseline_value" IS NULL OR "metric_type" IS NOT NULL));
-- One active plan per athlete and motion.
CREATE UNIQUE INDEX "training_plans_one_active" ON "training_plans"("athlete_id", "motion_type") WHERE "status" = 'ACTIVE';
ALTER TABLE "training_plan_items" ADD CONSTRAINT "training_plan_items_times" CHECK ("times_per_week" BETWEEN 1 AND 6 AND "position" BETWEEN 0 AND 9);

DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drills', 'training_plans', 'training_plan_items', 'training_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
