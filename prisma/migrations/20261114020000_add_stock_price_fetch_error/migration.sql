-- CreateEnum
CREATE TYPE "stock_price_fetch_error" AS ENUM ('quota', 'not_found', 'failed');

-- AlterTable
ALTER TABLE "company" ADD COLUMN     "prices_fetch_error" "stock_price_fetch_error";
