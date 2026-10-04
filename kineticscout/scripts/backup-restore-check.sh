#!/usr/bin/env bash
# Automated backup restoration test.
#
# Dumps the database at $SOURCE_DATABASE_URL (default: $DIRECT_DATABASE_URL), restores it into a
# throwaway database on the same server, verifies that every table's row count matches and that
# the migration history is intact, then drops the throwaway database. Exit code 0 means the backup
# is restorable. Schedule it (e.g. weekly in CI against a staging replica) and alert on failure.
#
# Requires: pg_dump, pg_restore, psql (PostgreSQL client 15+).
set -euo pipefail

SOURCE_URL="${SOURCE_DATABASE_URL:-${DIRECT_DATABASE_URL:-}}"
if [[ -z "$SOURCE_URL" ]]; then
  echo "Set SOURCE_DATABASE_URL or DIRECT_DATABASE_URL" >&2
  exit 2
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
WORKDIR="$(mktemp -d)"
DUMP="$WORKDIR/backup-$STAMP.dump"
SCRATCH_DB="restore_check_$STAMP"
# Admin connection on the same server (database name swapped to "postgres").
ADMIN_URL="$(echo "$SOURCE_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')"
SCRATCH_URL="$(echo "$SOURCE_URL" | sed -E "s#/[^/?]+(\\?|\$)#/$SCRATCH_DB\\1#")"

cleanup() {
  psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS \"$SCRATCH_DB\"" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "1/4 Dumping source database"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$SOURCE_URL"
echo "    dump size: $(du -h "$DUMP" | cut -f1)"

echo "2/4 Restoring into $SCRATCH_DB"
psql "$ADMIN_URL" -qc "CREATE DATABASE \"$SCRATCH_DB\""
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$DUMP"

echo "3/4 Comparing row counts"
COUNT_SQL="SELECT string_agg(format('%s=%s', table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text), ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
SOURCE_COUNTS="$(psql "$SOURCE_URL" -Atc "$COUNT_SQL")"
RESTORED_COUNTS="$(psql "$SCRATCH_URL" -Atc "$COUNT_SQL")"
if [[ "$SOURCE_COUNTS" != "$RESTORED_COUNTS" ]]; then
  echo "Row counts differ" >&2
  echo "source:   $SOURCE_COUNTS" >&2
  echo "restored: $RESTORED_COUNTS" >&2
  exit 1
fi

echo "4/4 Checking migration history and row level security"
MIGRATIONS="$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
UNPROTECTED="$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname <> '_prisma_migrations' AND NOT relrowsecurity")"
if [[ "$MIGRATIONS" -lt 1 || "$UNPROTECTED" -ne 0 ]]; then
  echo "Restored database is missing migrations ($MIGRATIONS) or has tables without RLS ($UNPROTECTED)" >&2
  exit 1
fi

echo "Backup restore check passed: $(echo "$SOURCE_COUNTS" | tr ',' '\n' | wc -l) tables, $MIGRATIONS migrations."
