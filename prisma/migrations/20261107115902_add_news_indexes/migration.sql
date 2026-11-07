-- CreateIndex
CREATE INDEX "news_released_at_idx" ON "news"("released_at" DESC);

-- CreateIndex
CREATE INDEX "news_company_released_at_idx" ON "news"("company", "released_at" DESC);
