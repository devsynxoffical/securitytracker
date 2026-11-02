-- AlterTable
ALTER TABLE "attendance_days" ADD COLUMN     "early_s" INTEGER,
ADD COLUMN     "late_s" INTEGER,
ADD COLUMN     "scheduled_end_at" TIMESTAMPTZ,
ADD COLUMN     "scheduled_start_at" TIMESTAMPTZ;

