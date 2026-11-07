-- CreateEnum
CREATE TYPE "unit" AS ENUM ('million', 'thousand', 'one');

-- CreateTable
CREATE TABLE "financial_year" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "name" TEXT,
    "unit" "unit",
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_season" (
    "id" SERIAL NOT NULL,
    "financial_year" INTEGER NOT NULL,
    "name" TEXT,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "estimate" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reporting_season_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "financial_year" ADD CONSTRAINT "financial_year_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_season" ADD CONSTRAINT "reporting_season_financial_year_fkey" FOREIGN KEY ("financial_year") REFERENCES "financial_year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
