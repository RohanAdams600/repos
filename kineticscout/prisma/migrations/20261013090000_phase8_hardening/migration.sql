-- Phase 8 launch hardening. Nothing here changes how the app reads or writes data: Prisma
-- connects as the table owner, which row level security does not restrict.
--
-- 1. Prisma's own bookkeeping table lives in the public schema too. Give it RLS with no
--    policies, like every other table, so Supabase's Data API can never read it.
--    (Prisma's shadow database has no such table, hence the check.)
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- 2. Every table in public has RLS on. This fails the migration if a table ever slips through.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Row level security is off on: %', missing;
  END IF;
END
$$;

-- 3. A final sweep of Data API grants (tables, sequences, functions), in case a grant was
--    added outside the migrations, and no default grants for objects created later.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- 4. Trigger functions run with a fixed search path, so an object created in another schema can
--    never shadow a table they reference. They are only ever called by their triggers.
ALTER FUNCTION "norm_rows_immutable"() SET search_path = public, pg_temp;
ALTER FUNCTION "messages_sender_in_thread"() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION "norm_rows_immutable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "messages_sender_in_thread"() FROM PUBLIC;
