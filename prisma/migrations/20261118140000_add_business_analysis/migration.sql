-- CreateEnum
CREATE TYPE "business_analysis_category" AS ENUM ('company_description', 'business_model', 'markets_and_competitors', 'products', 'strategy', 'acquisitions', 'risks');

-- CreateEnum
CREATE TYPE "business_analysis_run_status" AS ENUM ('running', 'done', 'failed');

-- AlterTable
ALTER TABLE "news" ADD COLUMN     "business_analyzed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "news_fetch" ADD COLUMN     "analysis_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "analyzed_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "business_analysis" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "news" INTEGER,
    "category" "business_analysis_category" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_analysis_run" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "status" "business_analysis_run_status" NOT NULL DEFAULT 'running',
    "news_count" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_analysis_company_category_created_at_idx" ON "business_analysis"("company", "category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "business_analysis_news_idx" ON "business_analysis"("news");

-- CreateIndex
CREATE INDEX "business_analysis_run_company_created_at_idx" ON "business_analysis_run"("company", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "business_analysis" ADD CONSTRAINT "business_analysis_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_analysis" ADD CONSTRAINT "business_analysis_news_fkey" FOREIGN KEY ("news") REFERENCES "news"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_analysis_run" ADD CONSTRAINT "business_analysis_run_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

