-- AlterTable
ALTER TABLE "company" ADD COLUMN     "nasdaq_name" TEXT,
ADD COLUMN     "news_fetched_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "news" ADD COLUMN     "nasdaq_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "news_nasdaq_id_key" ON "news"("nasdaq_id");
