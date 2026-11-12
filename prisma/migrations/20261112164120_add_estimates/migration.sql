-- CreateEnum
CREATE TYPE "estimate_type" AS ENUM ('relative', 'absolute');

-- AlterTable
ALTER TABLE "result_field" ADD COLUMN     "estimate_type" "estimate_type" NOT NULL DEFAULT 'relative';

-- CreateTable
CREATE TABLE "estimate_scenario" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_row" (
    "id" SERIAL NOT NULL,
    "estimate_scenario" INTEGER NOT NULL,
    "result_field" INTEGER NOT NULL,
    "reporting_season" INTEGER,
    "financial_year" INTEGER,
    "type" "estimate_type" NOT NULL,
    "value" DECIMAL(24,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimate_scenario_company_name_key" ON "estimate_scenario"("company", "name");

-- CreateIndex
CREATE INDEX "estimate_row_estimate_scenario_created_at_idx" ON "estimate_row"("estimate_scenario", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "estimate_scenario" ADD CONSTRAINT "estimate_scenario_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_row" ADD CONSTRAINT "estimate_row_estimate_scenario_fkey" FOREIGN KEY ("estimate_scenario") REFERENCES "estimate_scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_row" ADD CONSTRAINT "estimate_row_result_field_fkey" FOREIGN KEY ("result_field") REFERENCES "result_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_row" ADD CONSTRAINT "estimate_row_reporting_season_fkey" FOREIGN KEY ("reporting_season") REFERENCES "reporting_season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_row" ADD CONSTRAINT "estimate_row_financial_year_fkey" FOREIGN KEY ("financial_year") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A quarterly estimate points to a reporting season, a yearly one to a financial year.
ALTER TABLE "estimate_row" ADD CONSTRAINT "estimate_row_one_period_check" CHECK (("reporting_season" IS NULL) <> ("financial_year" IS NULL));
