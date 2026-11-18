-- Seed category for investor call transcripts, which are only added by hand: without keywords it
-- never matches received news.
INSERT INTO "news_category" ("name", "keywords") VALUES
    ('Sijoittajapuhelu', ARRAY[]::TEXT[]);
