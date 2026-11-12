-- CreateEnum
CREATE TYPE "result_field_type" AS ENUM ('net_debt', 'share_count');

-- CreateEnum
CREATE TYPE "yearly_value" AS ENUM ('sum', 'last_period');

-- CreateEnum
CREATE TYPE "valuation_basis" AS ENUM ('enterprise_value', 'market_value');

-- AlterTable
ALTER TABLE "result_field" ADD COLUMN     "type" "result_field_type",
ADD COLUMN     "yearly_value" "yearly_value" NOT NULL DEFAULT 'sum';

-- CreateTable
CREATE TABLE "valuation_multiple" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER,
    "result_field" INTEGER NOT NULL,
    "basis" "valuation_basis" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_multiple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valuation_multiple_value" (
    "id" SERIAL NOT NULL,
    "estimate_scenario" INTEGER NOT NULL,
    "valuation_multiple" INTEGER NOT NULL,
    "value" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valuation_multiple_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_valuation" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "target_financial_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "valuation_multiple_company_name_key" ON "valuation_multiple"("company", "name");

-- CreateIndex
CREATE UNIQUE INDEX "valuation_multiple_value_estimate_scenario_valuation_multip_key" ON "valuation_multiple_value"("estimate_scenario", "valuation_multiple");

-- CreateIndex
CREATE UNIQUE INDEX "company_valuation_company_key" ON "company_valuation"("company");

-- AddForeignKey
ALTER TABLE "valuation_multiple" ADD CONSTRAINT "valuation_multiple_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_multiple" ADD CONSTRAINT "valuation_multiple_result_field_fkey" FOREIGN KEY ("result_field") REFERENCES "result_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_multiple_value" ADD CONSTRAINT "valuation_multiple_value_estimate_scenario_fkey" FOREIGN KEY ("estimate_scenario") REFERENCES "estimate_scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valuation_multiple_value" ADD CONSTRAINT "valuation_multiple_value_valuation_multiple_fkey" FOREIGN KEY ("valuation_multiple") REFERENCES "valuation_multiple"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_valuation" ADD CONSTRAINT "company_valuation_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_valuation" ADD CONSTRAINT "company_valuation_target_financial_year_fkey" FOREIGN KEY ("target_financial_year") REFERENCES "financial_year"("id") ON DELETE SET NULL ON UPDATE CASCADE;
