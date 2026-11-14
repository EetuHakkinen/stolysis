-- CreateEnum
CREATE TYPE "result_refetch_status" AS ENUM ('running', 'done', 'failed');

-- CreateTable
CREATE TABLE "result_refetch" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "field_ids" INTEGER[],
    "status" "result_refetch_status" NOT NULL DEFAULT 'running',
    "news_count" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_refetch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_refetch_company_created_at_idx" ON "result_refetch"("company", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "result_refetch" ADD CONSTRAINT "result_refetch_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
