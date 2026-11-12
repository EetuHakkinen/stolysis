-- Estimates are stored as integers: relative ones in hundredths of a percent (348 = +3.48 %),
-- absolute ones in whole euros like result_row.
ALTER TABLE "estimate_row" ALTER COLUMN "value" SET DATA TYPE BIGINT USING (
  CASE WHEN "type" = 'relative' THEN ROUND("value" * 100) ELSE ROUND("value") END
);
