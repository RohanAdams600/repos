-- AlterTable
ALTER TABLE "metrics" ADD COLUMN     "client_ref" UUID;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" VARCHAR(1024) NOT NULL,
    "p256dh" VARCHAR(128) NOT NULL,
    "auth" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_success_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_athlete_id_client_ref_key" ON "metrics"("athlete_id", "client_ref");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written rules -----------------------------------------------------------------------------

-- Push endpoints are https URLs at a browser push service (the host allowlist lives in src/lib/push/webpush.ts).
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_https_endpoint" CHECK ("endpoint" LIKE 'https://%');

-- Server-only table: RLS on with no policies, Data API grants revoked.
DO $$
DECLARE
  r text;
BEGIN
  EXECUTE 'ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "push_subscriptions" FROM %I', r);
    END IF;
  END LOOP;
END
$$;
