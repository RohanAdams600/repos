-- Phase 7: enum values in their own migration, since a new value cannot be used in the
-- transaction that adds it.
ALTER TYPE "Role" ADD VALUE 'GUARDIAN';
ALTER TYPE "NotificationKind" ADD VALUE 'FAMILY';
ALTER TYPE "NotificationKind" ADD VALUE 'EVENT';
ALTER TYPE "NotificationKind" ADD VALUE 'TRAINING';
