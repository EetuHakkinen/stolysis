-- CreateEnum
CREATE TYPE "news_fetch_status" AS ENUM ('running', 'done', 'failed');

-- CreateTable
CREATE TABLE "news_fetch" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "status" "news_fetch_status" NOT NULL DEFAULT 'running',
    "news_count" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "extracted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_fetch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_fetch_company_created_at_idx" ON "news_fetch"("company", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "news_fetch" ADD CONSTRAINT "news_fetch_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

