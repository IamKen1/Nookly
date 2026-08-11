-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hasSeenTour" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing users are already familiar with the app — only genuinely
-- new users (created after this migration) should see the guided tour.
UPDATE "users" SET "hasSeenTour" = true;
