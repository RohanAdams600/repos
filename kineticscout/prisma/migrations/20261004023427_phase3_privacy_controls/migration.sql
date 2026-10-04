-- CreateEnum
CREATE TYPE "DeletionRequester" AS ENUM ('USER', 'GUARDIAN', 'ADMIN');

-- AlterTable
ALTER TABLE "guardian_consents" ADD COLUMN     "manage_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "manage_token_hash" CHAR(64);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_scheduled_for" TIMESTAMP(3),
ADD COLUMN     "marketing_opt_in_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "data_deletion_receipts" (
    "id" UUID NOT NULL,
    "subject_hash" CHAR(64) NOT NULL,
    "requested_by" "DeletionRequester" NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "steps" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_deletion_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_deletion_receipts_subject_hash_idx" ON "data_deletion_receipts"("subject_hash");

-- CreateIndex
CREATE INDEX "data_deletion_receipts_completed_at_scheduled_for_idx" ON "data_deletion_receipts"("completed_at", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_consents_manage_token_hash_key" ON "guardian_consents"("manage_token_hash");

-- CreateIndex
CREATE INDEX "users_deletion_scheduled_for_idx" ON "users"("deletion_scheduled_for");


-- Hand-written access rules (see init migration for rationale).
ALTER TABLE "data_deletion_receipts" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "data_deletion_receipts" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
