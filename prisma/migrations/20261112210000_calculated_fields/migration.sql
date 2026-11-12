-- A field's formulas point to the field instead of the field pointing to one definition, so a field
-- can have separate formulas for actuals and estimates. The table was unused and is empty.

-- CreateEnum
CREATE TYPE "field_definition_kind" AS ENUM ('actual', 'estimate');

-- DropForeignKey
ALTER TABLE "result_field" DROP CONSTRAINT "result_field_field_definition_fkey";

-- AlterTable
ALTER TABLE "field_definition" ADD COLUMN     "kind" "field_definition_kind" NOT NULL,
ADD COLUMN     "result_field" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "result_field" DROP COLUMN "field_definition";

-- CreateIndex
CREATE UNIQUE INDEX "field_definition_result_field_kind_key" ON "field_definition"("result_field", "kind");

-- AddForeignKey
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_result_field_fkey" FOREIGN KEY ("result_field") REFERENCES "result_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

