-- Business reviews (published by some companies for Q1 and Q3 instead of an interim report)
-- are interim reports for categorizing.
UPDATE "news_category"
SET "keywords" = "keywords" || ARRAY['Liiketoimintakatsaus', 'Business review'],
    "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = 'Osavuosikatsaus';
