"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { saveEstimate, type CompanyEstimates } from "@/actions/estimates";
import type { ResultGroup, ResultSeason } from "@/actions/results";
import { EstimateScenarioPicker } from "@/components/estimate-scenario-picker";
import {
  EstimateTable,
  quarterlyEstimateColumns,
  yearlyEstimateColumns,
  type EstimateColumn,
  type EstimatePeriod,
} from "@/components/estimate-table";
import {
  quarterlyResultColumns,
  ResultTable,
  yearlyResultColumns,
  type ResultColumn,
} from "@/components/result-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  predictCompany,
  seasonsWithData,
  type ActualValues,
  type EstimateInput,
} from "@/lib/estimates";

function periodKey(scenarioId: number, fieldId: number, period: EstimatePeriod) {
  return `${scenarioId}:${fieldId}:${period.reportingSeasonId ?? ""}:${period.financialYearId ?? ""}`;
}

// Result tabs: quarterly and yearly results, and the quarterly and yearly estimates of the scenario
// selected above the tabs. Every tab shows the same predicted values: the results use them for
// periods without data. Estimates saved here are kept in state on top of the loaded ones, so
// predicted values update without reloading the page.
export function ResultTabs({
  companyId,
  seasons,
  groups,
  estimates: { scenarios, years, currentYearId, fields, estimates },
  initialScenarioId,
}: {
  companyId: number;
  seasons: ResultSeason[];
  groups: ResultGroup[];
  estimates: CompanyEstimates;
  initialScenarioId: number | undefined;
}) {
  const t = useTranslations("Results");
  const [selectedId, setSelectedId] = useState(initialScenarioId);
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const scenario = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];

  // The selected scenario is kept in the URL, so it survives a reload. Changing it only replaces
  // the history entry: every scenario's estimates are already loaded.
  function select(scenarioId: number | undefined) {
    setSelectedId(scenarioId);
    const url = new URL(window.location.href);
    if (scenarioId == null) url.searchParams.delete("scenario");
    else url.searchParams.set("scenario", String(scenarioId));
    window.history.replaceState(null, "", url);
  }

  const actuals = useMemo<ActualValues>(
    () =>
      Object.fromEntries(groups.flatMap((group) => group.fields.map((field) => [field.id, field.values]))),
    [groups],
  );
  const withData = useMemo(() => seasonsWithData(actuals), [actuals]);

  // The scenario's current estimates with the edits made here.
  const inputs = useMemo(() => {
    const inputs = new Map<string, number | null>();
    if (!scenario) return inputs;
    for (const estimate of estimates[scenario.id] ?? [])
      inputs.set(periodKey(scenario.id, estimate.resultFieldId, estimate), estimate.value);
    for (const [key, value] of Object.entries(edits))
      if (key.startsWith(`${scenario.id}:`)) inputs.set(key, value);
    return inputs;
  }, [scenario, estimates, edits]);

  // Without a scenario, periods without data are empty.
  const prediction = useMemo(() => {
    const scenarioEstimates: EstimateInput[] = [...inputs].map(([key, value]) => {
      const [, fieldId, seasonId, yearId] = key.split(":");
      return {
        resultFieldId: Number(fieldId),
        reportingSeasonId: seasonId ? Number(seasonId) : null,
        financialYearId: yearId ? Number(yearId) : null,
        value,
      };
    });
    return predictCompany({ years, fields, actuals, estimates: scenarioEstimates });
  }, [inputs, years, fields, actuals]);

  const estimateTypes = new Map(fields.map((field) => [field.id, field.estimateType]));
  const tableGroups = groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({
      id: field.id,
      name: field.name,
      estimateType: estimateTypes.get(field.id) ?? "relative",
    })),
  }));

  function values(fieldId: number, period: EstimatePeriod) {
    return period.reportingSeasonId != null
      ? prediction.quarterly[fieldId]?.[period.reportingSeasonId]
      : prediction.yearly[fieldId]?.[period.financialYearId!];
  }

  function isEstimated(period: EstimatePeriod) {
    return fields.some((field) => values(field.id, period)?.source === "estimate");
  }

  async function save(fieldId: number, period: EstimatePeriod, value: number | null) {
    if (!scenario) return false;
    const { saved } = await saveEstimate({ scenarioId: scenario.id, resultFieldId: fieldId, ...period, value });
    if (saved) setEdits((edits) => ({ ...edits, [periodKey(scenario.id, fieldId, period)]: value }));
    return saved;
  }

  function resultTables(columns: ResultColumn[]) {
    return groups.map((group) => (
      <ResultTable key={group.id} name={group.name} fields={group.fields} columns={columns} values={values} />
    ));
  }

  function estimateTables(columns: (currentYearId: number) => EstimateColumn[]) {
    if (!scenario) return <p className="text-muted-foreground">{t("noScenarios")}</p>;
    if (currentYearId == null) return <p className="text-muted-foreground">{t("noYears")}</p>;
    const shown = columns(currentYearId);
    return tableGroups.map((group) => (
      <EstimateTable
        // Inputs keep their own text, so start them over for another scenario.
        key={`${scenario.id}-${group.id}`}
        name={group.name}
        fields={group.fields}
        columns={shown}
        values={values}
        input={(fieldId, period) => inputs.get(periodKey(scenario.id, fieldId, period))}
        save={save}
      />
    ));
  }

  const tabs: { value: "quarterly" | "yearly" | "quarterlyEstimates" | "yearlyEstimates"; content: React.ReactNode }[] = [
    { value: "quarterly", content: resultTables(quarterlyResultColumns(seasons, isEstimated)) },
    { value: "yearly", content: resultTables(yearlyResultColumns(seasons, isEstimated)) },
    {
      value: "quarterlyEstimates",
      content: estimateTables((current) => quarterlyEstimateColumns(years, current, withData)),
    },
    {
      value: "yearlyEstimates",
      content: estimateTables((current) => yearlyEstimateColumns(years, current)),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <EstimateScenarioPicker
        companyId={companyId}
        scenarios={scenarios}
        selected={scenario}
        onSelect={select}
      />
      <Tabs defaultValue="quarterly">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {t(`tabs.${tab.value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
