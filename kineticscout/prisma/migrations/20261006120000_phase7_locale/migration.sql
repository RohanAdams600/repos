-- Phase 7: interface and email language.

-- AlterTable
ALTER TABLE "guardian_consents" ADD COLUMN     "locale" VARCHAR(5) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(5) NOT NULL DEFAULT 'en';

ALTER TABLE "users" ADD CONSTRAINT "users_locale" CHECK ("locale" IN ('en', 'es'));
ALTER TABLE "guardian_consents" ADD CONSTRAINT "guardian_consents_locale" CHECK ("locale" IN ('en', 'es'));
