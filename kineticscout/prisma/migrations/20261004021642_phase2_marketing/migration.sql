-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('DATA_REPORT', 'CASE_STUDY');

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "consent_recorded_at" TIMESTAMP(3),
ADD COLUMN     "kind" "ContentKind" NOT NULL DEFAULT 'DATA_REPORT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acquisition" JSONB;

-- CreateTable
CREATE TABLE "testimonials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "descriptor" VARCHAR(120) NOT NULL,
    "quote" VARCHAR(600) NOT NULL,
    "rating" SMALLINT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "consent_recorded_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "topic" VARCHAR(32) NOT NULL,
    "message" VARCHAR(4000) NOT NULL,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "testimonials_status_published_at_idx" ON "testimonials"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages"("created_at");

-- CreateIndex
CREATE INDEX "blog_posts_kind_status_published_at_idx" ON "blog_posts"("kind", "status", "published_at" DESC);

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written constraints and access rules (see init migration for rationale).
ALTER TABLE "testimonials"
  ADD CONSTRAINT "testimonials_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);

-- A case study cannot be published without recorded consent from the featured athlete.
ALTER TABLE "blog_posts"
  ADD CONSTRAINT "blog_posts_case_study_consent" CHECK ("kind" <> 'CASE_STUDY' OR "status" <> 'PUBLISHED' OR "consent_recorded_at" IS NOT NULL);

ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "testimonials", "contact_messages" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
