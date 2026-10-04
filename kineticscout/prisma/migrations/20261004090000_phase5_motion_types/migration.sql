-- Hockey shot and football throw analysis (Phase 5). Adding enum values is non-blocking in PostgreSQL 12+.
ALTER TYPE "MotionType" ADD VALUE IF NOT EXISTS 'HOCKEY_SHOT';
ALTER TYPE "MotionType" ADD VALUE IF NOT EXISTS 'FOOTBALL_THROW';
