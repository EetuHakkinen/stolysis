-- CreateTable
CREATE TABLE "news_category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_category_name_key" ON "news_category"("name");

-- Seed categories. Keywords are matched case-insensitively as whole phrases, in id order;
-- Muu has none, it is the fallback when nothing matches.
INSERT INTO "news_category" ("name", "keywords") VALUES
    ('Johtohenkilöiden liiketoimet', ARRAY['Johtohenkilöiden liiketoimet', 'Managers'' transactions', 'Managers’ transactions']),
    ('Muut pörssin sääntöjen nojalla julkistettavat tiedot', ARRAY['Muut pörssin sääntöjen nojalla julkistettavat tiedot', 'Additional regulated information required to be disclosed under the laws of a member state']),
    ('Suurimmat osakkeenomistajat - tiedote', ARRAY['Suurimmat osakkeenomistajat', 'Liputusilmoitus', 'Major shareholder announcement', 'Major shareholder announcements', 'Flagging notification']),
    ('Tulosjulkistamisajankohdat', ARRAY['Tulosjulkistamisajankohdat', 'Financial calendar']),
    ('Sisäpiiritieto', ARRAY['Sisäpiiritieto', 'Inside information']),
    ('Muutokset omien osakkeiden omistuksessa', ARRAY['Muutokset omien osakkeiden omistuksessa', 'Changes in company''s own shares', 'Changes in company’s own shares']),
    ('Osavuosikatsaus', ARRAY['Osavuosikatsaus', 'Puolivuosikatsaus', 'Interim report', 'Half-year report', 'Half year financial report']),
    ('Yhtiökokouskutsu', ARRAY['Yhtiökokouskutsu', 'Kutsu varsinaiseen yhtiökokoukseen', 'Kutsu ylimääräiseen yhtiökokoukseen', 'Notice to general meeting', 'Notice of annual general meeting', 'Notice of the annual general meeting', 'Notice of extraordinary general meeting', 'Notice of the extraordinary general meeting']),
    ('Pääomatapahtuma', ARRAY['Pääomatapahtuma', 'Capital event', 'Capital events']),
    ('Julkinen ostotarjous', ARRAY['Julkinen ostotarjous', 'Ostotarjous', 'Tender offer', 'Takeover bid']),
    ('Yhtiötiedote', ARRAY['Yhtiötiedote', 'Company announcement', 'Company release']),
    ('Muu', ARRAY[]::TEXT[]);

-- AlterTable: existing news go to Muu.
ALTER TABLE "news" ADD COLUMN "category" INTEGER;
UPDATE "news" SET "category" = (SELECT "id" FROM "news_category" WHERE "name" = 'Muu');
ALTER TABLE "news" ALTER COLUMN "category" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_category_fkey" FOREIGN KEY ("category") REFERENCES "news_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
