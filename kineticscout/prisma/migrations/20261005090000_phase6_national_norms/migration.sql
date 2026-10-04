-- CreateEnum
CREATE TYPE "NormDatasetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "norm_datasets" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "publisher" VARCHAR(160) NOT NULL,
    "edition" VARCHAR(40) NOT NULL,
    "population" VARCHAR(400) NOT NULL,
    "source_url" VARCHAR(512) NOT NULL,
    "licence" VARCHAR(1000) NOT NULL,
    "licence_expires_at" DATE,
    "status" "NormDatasetStatus" NOT NULL DEFAULT 'DRAFT',
    "row_count" INTEGER NOT NULL,
    "imported_by_id" UUID,
    "activated_at" TIMESTAMP(3),
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "norm_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norm_rows" (
    "id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "metric_type" "MetricType" NOT NULL,
    "age_min" SMALLINT,
    "age_max" SMALLINT,
    "height_min" SMALLINT,
    "height_max" SMALLINT,
    "weight_min" SMALLINT,
    "weight_max" SMALLINT,
    "sample_size" INTEGER NOT NULL,
    "p10" DECIMAL(8,3) NOT NULL,
    "p25" DECIMAL(8,3) NOT NULL,
    "p50" DECIMAL(8,3) NOT NULL,
    "p75" DECIMAL(8,3) NOT NULL,
    "p90" DECIMAL(8,3) NOT NULL,

    CONSTRAINT "norm_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "norm_datasets_status_activated_at_idx" ON "norm_datasets"("status", "activated_at");

-- CreateIndex
CREATE UNIQUE INDEX "norm_datasets_publisher_name_edition_key" ON "norm_datasets"("publisher", "name", "edition");

-- CreateIndex
CREATE INDEX "norm_rows_dataset_id_metric_type_idx" ON "norm_rows"("dataset_id", "metric_type");

-- AddForeignKey
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "norm_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written rules -----------------------------------------------------------------------------

ALTER TABLE "norm_datasets" ADD CONSTRAINT "norm_datasets_https_source" CHECK ("source_url" LIKE 'https://%');
ALTER TABLE "norm_datasets" ADD CONSTRAINT "norm_datasets_licence_stated" CHECK (length(btrim("licence")) >= 10);
ALTER TABLE "norm_datasets" ADD CONSTRAINT "norm_datasets_active_has_date" CHECK ("status" <> 'ACTIVE' OR "activated_at" IS NOT NULL);
ALTER TABLE "norm_datasets" ADD CONSTRAINT "norm_datasets_retired_has_date" CHECK ("status" <> 'RETIRED' OR "retired_at" IS NOT NULL);

-- Published bands need a sample large enough to mean something, matching the k-anonymity floor.
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_sample_floor" CHECK ("sample_size" >= 25);
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_quantiles_ordered" CHECK ("p10" <= "p25" AND "p25" <= "p50" AND "p50" <= "p75" AND "p75" <= "p90");
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_age_band" CHECK (("age_min" IS NULL) = ("age_max" IS NULL) AND ("age_min" IS NULL OR "age_min" <= "age_max"));
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_height_band" CHECK (("height_min" IS NULL) = ("height_max" IS NULL) AND ("height_min" IS NULL OR "height_min" <= "height_max"));
ALTER TABLE "norm_rows" ADD CONSTRAINT "norm_rows_weight_band" CHECK (("weight_min" IS NULL) = ("weight_max" IS NULL) AND ("weight_min" IS NULL OR "weight_min" <= "weight_max"));

-- Rows are what the licence covers: never edited in place. A correction is a new edition.
CREATE FUNCTION "norm_rows_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'norm rows are immutable; import a new edition instead';
END
$$;
CREATE TRIGGER "norm_rows_no_update" BEFORE UPDATE ON "norm_rows" FOR EACH ROW EXECUTE FUNCTION "norm_rows_immutable"();

-- Server-only tables: RLS on with no policies, Data API grants revoked.
DO $$
DECLARE
  t text;
  r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['norm_datasets', 'norm_rows'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
