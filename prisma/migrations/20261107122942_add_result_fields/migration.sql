-- CreateTable
CREATE TABLE "result_field_group" (
    "id" SERIAL NOT NULL,
    "company" INTEGER NOT NULL,
    "order" INTEGER,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_field_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_field" (
    "id" SERIAL NOT NULL,
    "result_field_group" INTEGER NOT NULL,
    "order" INTEGER,
    "name" TEXT,
    "field_definition" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definition" (
    "id" SERIAL NOT NULL,
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_row" (
    "id" SERIAL NOT NULL,
    "reporting_season" INTEGER NOT NULL,
    "result_field" INTEGER NOT NULL,
    "value" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_row_reporting_season_result_field_key" ON "result_row"("reporting_season", "result_field");

-- AddForeignKey
ALTER TABLE "result_field_group" ADD CONSTRAINT "result_field_group_company_fkey" FOREIGN KEY ("company") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_field" ADD CONSTRAINT "result_field_result_field_group_fkey" FOREIGN KEY ("result_field_group") REFERENCES "result_field_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_field" ADD CONSTRAINT "result_field_field_definition_fkey" FOREIGN KEY ("field_definition") REFERENCES "field_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_row" ADD CONSTRAINT "result_row_reporting_season_fkey" FOREIGN KEY ("reporting_season") REFERENCES "reporting_season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_row" ADD CONSTRAINT "result_row_result_field_fkey" FOREIGN KEY ("result_field") REFERENCES "result_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;
