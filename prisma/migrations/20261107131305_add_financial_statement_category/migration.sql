-- Seed category for financial statement releases, which otherwise fall back to Muu.
INSERT INTO "news_category" ("name", "keywords") VALUES
    ('Tilinpäätöstiedote', ARRAY['Tilinpäätöstiedote', 'Tilinpäätös', 'Financial statement release', 'Financial statements release', 'Financial statement bulletin', 'Financial statements bulletin']);
