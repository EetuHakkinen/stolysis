-- CreateEnum
CREATE TYPE "discount_variable" AS ENUM ('tax_rate', 'target_debt_ratio', 'cost_of_debt', 'beta', 'market_risk_premium', 'liquidity_premium', 'risk_free_rate', 'terminal_growth');

-- CreateTable
CREATE TABLE "company_discount_variable" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "variable" "discount_variable" NOT NULL,
    "value" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_discount_variable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_discount_variable_company_variable_key" ON "company_discount_variable"("company", "variable");

-- AddForeignKey
ALTER TABLE "company_discount_variable" ADD CONSTRAINT "company_discount_variable_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
