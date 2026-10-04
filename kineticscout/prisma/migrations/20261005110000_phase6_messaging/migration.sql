-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageReporter" AS ENUM ('ATHLETE', 'COACH', 'GUARDIAN');

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "contact_request_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "guardian_copy" BOOLEAN NOT NULL,
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
    "closed_by" VARCHAR(20),
    "closed_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reports" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reporter_kind" "MessageReporter" NOT NULL,
    "reporter_id" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_contact_request_id_key" ON "message_threads"("contact_request_id");

-- CreateIndex
CREATE INDEX "message_threads_coach_id_last_message_at_idx" ON "message_threads"("coach_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "message_threads_athlete_id_last_message_at_idx" ON "message_threads"("athlete_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "message_threads_status_closed_at_idx" ON "message_threads"("status", "closed_at");

-- CreateIndex
CREATE INDEX "messages_thread_id_created_at_idx" ON "messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "message_reports_resolved_at_created_at_idx" ON "message_reports"("resolved_at", "created_at");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_contact_request_id_fkey" FOREIGN KEY ("contact_request_id") REFERENCES "contact_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athlete_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written rules -----------------------------------------------------------------------------

ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_closed_has_date" CHECK (("status" = 'CLOSED') = ("closed_at" IS NOT NULL));
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_present" CHECK (length(btrim("body")) >= 1);
-- Account holders report as themselves; a guardian reports through the signed link, without an account.
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter" CHECK (("reporter_kind" = 'GUARDIAN') = ("reporter_id" IS NULL));
-- The sender must be one of the two people in the thread.
CREATE FUNCTION "messages_sender_in_thread"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "message_threads" t WHERE t."id" = NEW."thread_id" AND NEW."sender_id" IN (t."coach_id", t."athlete_id")) THEN
    RAISE EXCEPTION 'message sender is not part of this thread';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "messages_sender_check" BEFORE INSERT ON "messages" FOR EACH ROW EXECUTE FUNCTION "messages_sender_in_thread"();

-- Server-only tables: RLS on with no policies, Data API grants revoked.
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['message_threads', 'messages', 'message_reports'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
