-- AlterEnum
ALTER TYPE "yearly_value" ADD VALUE 'yearly_only';

-- AlterTable
ALTER TABLE "financial_year" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "result_row" ADD COLUMN     "financial_year" INTEGER,
ALTER COLUMN "reporting_season" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "result_row_financial_year_result_field_created_at_idx" ON "result_row"("financial_year", "result_field", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "result_row" ADD CONSTRAINT "result_row_financial_year_fkey" FOREIGN KEY ("financial_year") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A result of a field reported quarterly points to a reporting season, one of a field reported
-- only yearly to a financial year.
ALTER TABLE "result_row" ADD CONSTRAINT "result_row_one_period_check" CHECK (("reporting_season" IS NULL) <> ("financial_year" IS NULL));
