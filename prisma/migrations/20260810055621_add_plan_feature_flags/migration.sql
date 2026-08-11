-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "featureAlerts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureMultiBranch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featurePrescriptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureReports" BOOLEAN NOT NULL DEFAULT false;
