-- Some companies (e.g. Revenio) call their interim reports "osavuosiraportti" and half-year
-- reports "puolivuosiraportti".
UPDATE "news_category"
SET "keywords" = "keywords" || ARRAY['Osavuosiraportti', 'Puolivuosiraportti'],
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'Osavuosikatsaus';
