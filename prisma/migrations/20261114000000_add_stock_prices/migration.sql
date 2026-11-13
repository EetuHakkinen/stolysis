-- AlterTable
ALTER TABLE "company" ADD COLUMN     "price_symbol" TEXT,
ADD COLUMN     "prices_fetched_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stock_price" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "close" INTEGER NOT NULL,
    "adjusted_close" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_price_company_date_key" ON "stock_price"("company", "date");

-- AddForeignKey
ALTER TABLE "stock_price" ADD CONSTRAINT "stock_price_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
