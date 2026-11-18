-- AlterTable
ALTER TABLE "news" ADD COLUMN     "period_reviewed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "note" ADD COLUMN     "ai_generated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "news_fetch" ADD COLUMN     "period_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "period_reviewed_count" INTEGER NOT NULL DEFAULT 0;

