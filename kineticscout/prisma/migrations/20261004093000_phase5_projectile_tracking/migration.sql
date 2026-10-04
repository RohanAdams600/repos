-- AlterTable
ALTER TABLE "video_analyses" ADD COLUMN     "projectile" JSONB,
ADD COLUMN     "track_object" BOOLEAN NOT NULL DEFAULT false;

