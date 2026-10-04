-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ATHLETE', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('BASEBALL', 'HOCKEY', 'FOOTBALL');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('RHP', 'LHP', 'CATCHER', '1B', '2B', '3B', 'SHORTSTOP', 'OUTFIELD', 'UTILITY', 'CENTER', 'WING', 'DEFENSE', 'GOALIE', 'QUARTERBACK', 'RUNNING_BACK', 'WIDE_RECEIVER', 'TIGHT_END', 'OFFENSIVE_LINE', 'DEFENSIVE_LINE', 'LINEBACKER', 'DEFENSIVE_BACK', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "MetricType" AS ENUM ('EXIT_VELOCITY', 'PITCH_VELO', '60_YARD_DASH', 'POP_TIME', 'INFIELD_VELO', 'OUTFIELD_VELO', 'BAT_SPEED', 'SLAPSHOT_SPEED', 'WRIST_SHOT_SPEED', 'THROW_VELOCITY', 'THROW_DISTANCE', 'SPIRAL_EFFICIENCY', '40_YARD_DASH');

-- CreateEnum
CREATE TYPE "Division" AS ENUM ('D1', 'D2', 'D3', 'NAIA', 'JUCO');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('INTERESTED', 'CONTACTED', 'OFFERED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('OPEN', 'COMPLETE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GuardianConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MotionType" AS ENUM ('SWING', 'PITCH');

-- CreateEnum
CREATE TYPE "Handedness" AS ENUM ('RIGHT', 'LEFT');

-- CreateEnum
CREATE TYPE "VideoAnalysisStatus" AS ENUM ('AWAITING_UPLOAD', 'QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketingChannel" AS ENUM ('META_AD', 'INSTAGRAM_POST', 'FACEBOOK_POST', 'X_POST');

-- CreateEnum
CREATE TYPE "MarketingAssetStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('GROWTH', 'SEO', 'RECRUITING');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('GROWTH_AGENT', 'SEO_AGENT', 'OUTREACH_DRAFT', 'VIDEO_ANALYSIS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ATHLETE',
    "stripe_customer_id" VARCHAR(64),
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "date_of_birth" DATE NOT NULL,
    "marketing_email_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "terms_version" VARCHAR(16) NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "guardian_email" VARCHAR(254) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "GuardianConsentStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "granted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_profiles" (
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "grad_year" SMALLINT NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'BASEBALL',
    "primary_position" "Position" NOT NULL,
    "height" SMALLINT,
    "weight" SMALLINT,
    "gpa" DECIMAL(3,2),
    "high_school" VARCHAR(120),
    "twitter_handle" VARCHAR(15),
    "bats" "Handedness",
    "throws" "Handedness",
    "public_slug" VARCHAR(64),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "value" DECIMAL(7,2) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "video_url" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_programs" (
    "id" UUID NOT NULL,
    "school_name" VARCHAR(160) NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'BASEBALL',
    "division" "Division" NOT NULL,
    "conference" VARCHAR(120),
    "state" CHAR(2),
    "average_recruiting_metrics" JSONB NOT NULL,
    "min_gpa" DECIMAL(3,2),
    "head_coach_name" VARCHAR(120),
    "head_coach_email" VARCHAR(254),
    "head_coach_since" DATE,
    "data_source_url" VARCHAR(512),
    "data_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiting_pipeline" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "college_id" UUID NOT NULL,
    "status" "PipelineStatus" NOT NULL DEFAULT 'INTERESTED',
    "last_contact_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiting_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "price_id" VARCHAR(64) NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "price_id" VARCHAR(64) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(128) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_analyses" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "motion_type" "MotionType" NOT NULL,
    "handedness" "Handedness" NOT NULL,
    "status" "VideoAnalysisStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "object_key" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "pose_data" JSONB,
    "report" JSONB,
    "algorithm" VARCHAR(32),
    "error_code" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "video_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "percentile_baselines" (
    "id" UUID NOT NULL,
    "computed_for" DATE NOT NULL,
    "cohort_key" VARCHAR(64) NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "grad_year" SMALLINT,
    "position" "Position",
    "sample_size" INTEGER NOT NULL,
    "p10" DECIMAL(7,2) NOT NULL,
    "p25" DECIMAL(7,2) NOT NULL,
    "p50" DECIMAL(7,2) NOT NULL,
    "p75" DECIMAL(7,2) NOT NULL,
    "p90" DECIMAL(7,2) NOT NULL,
    "mean" DECIMAL(7,2) NOT NULL,
    "stddev" DECIMAL(7,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "percentile_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "meta_description" VARCHAR(160) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "data_snapshot" JSONB NOT NULL,
    "validation_report" JSONB,
    "generated_by" VARCHAR(64),
    "agent_run_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_assets" (
    "id" UUID NOT NULL,
    "agent_run_id" UUID NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "status" "MarketingAssetStatus" NOT NULL DEFAULT 'DRAFT',
    "topic" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "compliance_issues" JSONB NOT NULL,
    "external_id" VARCHAR(128),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agent" "AgentType" NOT NULL,
    "slot" VARCHAR(32) NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consents_user_id_key" ON "guardian_consents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consents_token_hash_key" ON "guardian_consents"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profiles_public_slug_key" ON "athlete_profiles"("public_slug");

-- CreateIndex
CREATE INDEX "athlete_profiles_sport_grad_year_primary_position_idx" ON "athlete_profiles"("sport", "grad_year", "primary_position");

-- CreateIndex
CREATE INDEX "metrics_athlete_id_metric_type_date_idx" ON "metrics"("athlete_id", "metric_type", "date" DESC);

-- CreateIndex
CREATE INDEX "metrics_athlete_id_created_at_idx" ON "metrics"("athlete_id", "created_at");

-- CreateIndex
CREATE INDEX "metrics_metric_type_date_idx" ON "metrics"("metric_type", "date");

-- CreateIndex
CREATE INDEX "college_programs_sport_division_idx" ON "college_programs"("sport", "division");

-- CreateIndex
CREATE UNIQUE INDEX "college_programs_school_name_sport_key" ON "college_programs"("school_name", "sport");

-- CreateIndex
CREATE INDEX "recruiting_pipeline_athlete_id_status_idx" ON "recruiting_pipeline"("athlete_id", "status");

-- CreateIndex
CREATE INDEX "recruiting_pipeline_college_id_idx" ON "recruiting_pipeline"("college_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruiting_pipeline_athlete_id_college_id_key" ON "recruiting_pipeline"("athlete_id", "college_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "checkout_sessions_user_id_status_expires_at_idx" ON "checkout_sessions"("user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "stripe_events_processed_at_idx" ON "stripe_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "video_analyses_object_key_key" ON "video_analyses"("object_key");

-- CreateIndex
CREATE INDEX "video_analyses_athlete_id_created_at_idx" ON "video_analyses"("athlete_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "video_analyses_status_created_at_idx" ON "video_analyses"("status", "created_at");

-- CreateIndex
CREATE INDEX "percentile_baselines_metric_type_grad_year_position_compute_idx" ON "percentile_baselines"("metric_type", "grad_year", "position", "computed_for" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "percentile_baselines_computed_for_cohort_key_key" ON "percentile_baselines"("computed_for", "cohort_key");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_published_at_idx" ON "blog_posts"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "marketing_assets_status_created_at_idx" ON "marketing_assets"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "marketing_assets_agent_run_id_idx" ON "marketing_assets"("agent_run_id");

-- CreateIndex
CREATE INDEX "agent_runs_agent_started_at_idx" ON "agent_runs"("agent", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_agent_slot_key" ON "agent_runs"("agent", "slot");

-- CreateIndex
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiting_pipeline" ADD CONSTRAINT "recruiting_pipeline_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiting_pipeline" ADD CONSTRAINT "recruiting_pipeline_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "college_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_analyses" ADD CONSTRAINT "video_analyses_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_assets" ADD CONSTRAINT "marketing_assets_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints Prisma cannot express in schema.prisma.
-- ---------------------------------------------------------------------------

-- At most one live Stripe subscription per user. Backstop for the application-level
-- duplicate checks in src/lib/billing; a second live row fails loudly instead of double billing.
CREATE UNIQUE INDEX "subscriptions_one_live_per_user"
  ON "subscriptions"("user_id")
  WHERE "status" IN ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE');

-- Data integrity checks.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

ALTER TABLE "athlete_profiles"
  ADD CONSTRAINT "athlete_profiles_grad_year_range" CHECK ("grad_year" BETWEEN 2020 AND 2045),
  ADD CONSTRAINT "athlete_profiles_height_range" CHECK ("height" IS NULL OR "height" BETWEEN 48 AND 96),
  ADD CONSTRAINT "athlete_profiles_weight_range" CHECK ("weight" IS NULL OR "weight" BETWEEN 70 AND 400),
  ADD CONSTRAINT "athlete_profiles_gpa_range" CHECK ("gpa" IS NULL OR "gpa" BETWEEN 0 AND 5),
  ADD CONSTRAINT "athlete_profiles_twitter_handle_format" CHECK ("twitter_handle" IS NULL OR "twitter_handle" ~ '^[A-Za-z0-9_]{1,15}$'),
  ADD CONSTRAINT "athlete_profiles_public_slug_format" CHECK ("public_slug" IS NULL OR "public_slug" ~ '^[a-z0-9-]{3,64}$');

ALTER TABLE "metrics"
  ADD CONSTRAINT "metrics_value_positive" CHECK ("value" > 0);

ALTER TABLE "college_programs"
  ADD CONSTRAINT "college_programs_metrics_is_object" CHECK (jsonb_typeof("average_recruiting_metrics") = 'object'),
  ADD CONSTRAINT "college_programs_min_gpa_range" CHECK ("min_gpa" IS NULL OR "min_gpa" BETWEEN 0 AND 5);

ALTER TABLE "video_analyses"
  ADD CONSTRAINT "video_analyses_size_positive" CHECK ("size_bytes" > 0);

-- k-anonymity floor: no stored aggregate may describe fewer than 10 athletes, whatever
-- the application threshold is configured to.
ALTER TABLE "percentile_baselines"
  ADD CONSTRAINT "percentile_baselines_k_anonymity_floor" CHECK ("sample_size" >= 10);

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_cost_non_negative" CHECK ("cost_micros" >= 0);

-- ---------------------------------------------------------------------------
-- Database access rules.
--
-- Supabase exposes the public schema through its Data API to the anon and authenticated
-- roles. KineticScout never uses that API: all access goes through Prisma as the table owner.
-- Enable RLS with no policies (deny all) and revoke grants so a leaked publishable key
-- cannot read or write any table.
-- ---------------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "athlete_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "college_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recruiting_pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checkout_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "video_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "percentile_baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blog_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
