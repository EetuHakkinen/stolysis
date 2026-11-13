-- CreateEnum
CREATE TYPE "value_format" AS ENUM ('money', 'percent');

-- CreateEnum
CREATE TYPE "graph_field_type" AS ENUM ('line', 'bar');

-- CreateEnum
CREATE TYPE "graph_axis" AS ENUM ('left', 'right');

-- AlterTable
ALTER TABLE "result_field" ADD COLUMN     "value_format" "value_format" NOT NULL DEFAULT 'money';

-- CreateTable
CREATE TABLE "graph" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_field" (
    "id" SERIAL NOT NULL,
    "graph" INTEGER NOT NULL,
    "result_field" INTEGER NOT NULL,
    "type" "graph_field_type" NOT NULL DEFAULT 'line',
    "axis" "graph_axis" NOT NULL DEFAULT 'left',
    "order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "graph_company_name_key" ON "graph"("company", "name");

-- CreateIndex
CREATE UNIQUE INDEX "graph_field_graph_result_field_key" ON "graph_field"("graph", "result_field");

-- AddForeignKey
ALTER TABLE "graph" ADD CONSTRAINT "graph_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_field" ADD CONSTRAINT "graph_field_graph_fkey" FOREIGN KEY ("graph") REFERENCES "graph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_field" ADD CONSTRAINT "graph_field_result_field_fkey" FOREIGN KEY ("result_field") REFERENCES "result_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
