-- High school and travel team coaches (Phase 6). Its own migration: Postgres cannot use a new enum
-- value in the transaction that adds it.
ALTER TYPE "Role" ADD VALUE 'TEAM_COACH';
