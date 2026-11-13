-- CreateTable
CREATE TABLE "note" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "news" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_company_date_idx" ON "note"("company", "date" DESC);

-- CreateIndex
CREATE INDEX "note_news_idx" ON "note"("news");

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note" ADD CONSTRAINT "note_news_fkey" FOREIGN KEY ("news") REFERENCES "news"("id") ON DELETE SET NULL ON UPDATE CASCADE;
