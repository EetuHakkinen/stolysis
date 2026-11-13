-- DropIndex
DROP INDEX "valuation_multiple_value_estimate_scenario_valuation_multip_key";

-- CreateIndex
CREATE INDEX "valuation_multiple_value_estimate_scenario_valuation_multip_idx" ON "valuation_multiple_value"("estimate_scenario", "valuation_multiple", "created_at" DESC);
