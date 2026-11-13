"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { CompanyValuationData } from "@/actions/valuation";
import { ValuationTable } from "@/components/valuation-table";
import { ValuationTargetPicker } from "@/components/valuation-target-picker";
import type { CompanyPrediction, EstimateYear } from "@/lib/estimates";
import { costOfEquity, type DiscountValues } from "@/lib/discounting";
import { calculateValuation, presentValue, yearsUntil } from "@/lib/valuation";

// Valuation of the selected scenario: the target year, the same for every scenario, and the
// valuation table for it. The target year's market value is discounted to the present with the
// company's cost of equity, from now until the end of the target year. Values and the target year
// are kept by the caller, so they survive switching tabs and scenarios.
export function ValuationTab({
  scenarioId,
  years,
  prediction,
  valuation: { multiples, fieldIds },
  values,
  discountValues,
  targetYearId,
  selectTargetYear,
  save,
}: {
  scenarioId: number;
  // Financial years that can be the target year.
  years: EstimateYear[];
  prediction: CompanyPrediction;
  valuation: CompanyValuationData;
  // The scenario's multiple values by multiple id.
  values: Record<number, number | null | undefined>;
  discountValues: DiscountValues;
  targetYearId: number | null;
  selectTargetYear: (yearId: number) => Promise<boolean>;
  save: (multipleId: number, value: number | null) => Promise<boolean>;
}) {
  const t = useTranslations("Valuation");
  const [targetError, setTargetError] = useState(false);
  const [, startTransition] = useTransition();

  if (multiples.length === 0) return <p className="text-muted-foreground">{t("noMultiples")}</p>;

  const targetYear = years.find((year) => year.id === targetYearId);

  function valuationTable(targetYear: EstimateYear) {
    const result = calculateValuation({
      multiples,
      values,
      prediction,
      targetYearId: targetYear.id,
      netDebtFieldId: fieldIds.net_debt,
      shareCountFieldId: fieldIds.share_count,
    });
    const rate = costOfEquity(discountValues);
    const years = yearsUntil(targetYear.endTime, new Date());
    return (
      <ValuationTable
        // Inputs keep their own text, so start them over for another scenario.
        key={scenarioId}
        multiples={multiples}
        values={values}
        valuation={result}
        present={{
          marketValue: presentValue(result.averageMarketValue, rate, years),
          valuePerShare: presentValue(result.valuePerShare, rate, years),
        }}
        unit={targetYear.unit ?? "one"}
        save={save}
      />
    );
  }

  function select(yearId: number) {
    startTransition(async () => setTargetError(!(await selectTargetYear(yearId))));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <ValuationTargetPicker years={years} selectedId={targetYear?.id ?? null} onSelect={select} />
        {targetError && <p className="text-sm text-destructive">{t("saveFailed")}</p>}
      </div>
      {targetYear ? (
        valuationTable(targetYear)
      ) : (
        <p className="text-muted-foreground">{t("noTargetYear")}</p>
      )}
    </div>
  );
}
