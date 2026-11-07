-- DropIndex
DROP INDEX "result_row_reporting_season_result_field_key";

-- AlterTable
ALTER TABLE "reporting_season" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "result_row" ADD COLUMN     "news" INTEGER;

-- CreateIndex
CREATE INDEX "result_row_reporting_season_result_field_created_at_idx" ON "result_row"("reporting_season", "result_field", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "result_row" ADD CONSTRAINT "result_row_news_fkey" FOREIGN KEY ("news") REFERENCES "news"("id") ON DELETE SET NULL ON UPDATE CASCADE;
