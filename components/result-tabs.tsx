"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { saveDiscountVariable } from "@/actions/discounting";
import { saveEstimate, type CompanyEstimates } from "@/actions/estimates";
import type { GraphData } from "@/actions/graphs";
import type { ResultGroup, ResultSeason } from "@/actions/results";
import {
  saveMultipleValue,
  setValuationTargetYear,
  type CompanyValuationData,
} from "@/actions/valuation";
import type { DiscountVariable } from "@/app/generated/prisma/client";
import { DcfCashFlowTable } from "@/components/dcf-cash-flow-table";
import { DcfTable } from "@/components/dcf-table";
import { DcfValueChart } from "@/components/dcf-value-chart";
import { DiscountVariablesTable } from "@/components/discount-variables-table";
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
import {
  quarterlyGraphColumns,
  ResultGraphs,
  summaryColumns,
  yearlyGraphColumns,
} from "@/components/result-graphs";
import { useSelectedScenario } from "@/components/selected-scenario";
import { StockPriceChart } from "@/components/stock-price-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PriceMultiplesTable } from "@/components/price-multiples-table";
import { ValuationTab } from "@/components/valuation-tab";
import { ValuePerShareTable } from "@/components/value-per-share-table";
import {
  predictCompany,
  seasonsWithData,
  type ActualValues,
  type EstimateInput,
  type EstimateYear,
} from "@/lib/estimates";
import { calculateDcf } from "@/lib/dcf";
import { costOfEquity, wacc, type DiscountValues } from "@/lib/discounting";
import type { StockPricePoint } from "@/lib/stock-price";
import { calculateValuation, presentValuation, priceMultiples } from "@/lib/valuation";

// The summary's multiples at the stock price: the current financial year and two after it.
const PRICE_MULTIPLE_YEARS = 3;

function periodKey(scenarioId: number, fieldId: number, period: EstimatePeriod) {
  return `${scenarioId}:${fieldId}:${period.reportingSeasonId ?? ""}:${period.financialYearId ?? ""}`;
}

// Result tabs: a valuation summary of the starred fields' yearly values and the starred graphs
// around the current financial year, the stock price's development, quarterly and yearly results, the quarterly and yearly estimates of the scenario
// selected above the tabs, the scenario's valuation, and the scenario's DCF cash flows and value with
// the company's discount variables. Every tab
// shows the same predicted values: the results use them for periods without data. The result and
// estimate tabs show the company's graphs below the tables. Estimates,
// multiple values, the valuation's target year and discount variables saved here are kept in state
// on top of the loaded ones, so values update without reloading the page.
export function ResultTabs({
  companyId,
  seasons,
  groups,
  estimates: { scenarios, years, currentYearId, fields, estimates },
  graphs,
  valuation,
  discountVariables,
  stockPrices,
}: {
  companyId: number;
  seasons: ResultSeason[];
  groups: ResultGroup[];
  estimates: CompanyEstimates;
  graphs: GraphData[];
  valuation: CompanyValuationData;
  discountVariables: DiscountValues;
  stockPrices: StockPricePoint[];
}) {
  const t = useTranslations("Results");
  const { selectedId, select } = useSelectedScenario();
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  // Saved multiple values by scenario id, then by multiple id.
  const [multipleEdits, setMultipleEdits] = useState<Record<number, Record<number, number | null>>>({});
  const [targetYearId, setTargetYearId] = useState(valuation.targetYearId);
  const [discountValues, setDiscountValues] = useState(discountVariables);
  const scenario = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];

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

  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const tableGroups = groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({
      id: field.id,
      name: field.name,
      valueFormat: field.valueFormat,
      estimateType: fieldsById.get(field.id)?.estimateType ?? "relative",
      calculated: fieldsById.get(field.id)?.estimateDefinition != null,
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

  const graphFields = new Map(groups.flatMap((group) => group.fields.map((field) => [field.id, field])));

  function resultGraphs(columns: ResultColumn[], shown = graphs) {
    return <ResultGraphs graphs={shown} fields={graphFields} columns={columns} values={values} />;
  }

  function resultTables(columns: ResultColumn[]) {
    return (
      <>
        {groups.map((group) => (
          <ResultTable key={group.id} name={group.name} fields={group.fields} columns={columns} values={values} />
        ))}
        {resultGraphs(columns)}
      </>
    );
  }

  function estimateTables(
    columns: (currentYearId: number) => EstimateColumn[],
    graphColumns: (currentYearId: number) => ResultColumn[],
  ) {
    if (!scenario) return <p className="text-muted-foreground">{t("noScenarios")}</p>;
    if (currentYearId == null) return <p className="text-muted-foreground">{t("noYears")}</p>;
    const shown = columns(currentYearId);
    const tables = tableGroups.map((group) => (
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
    return (
      <>
        {tables}
        {resultGraphs(graphColumns(currentYearId))}
      </>
    );
  }

  // Years that can be the valuation's target year: the current financial year or a later one.
  function targetYears() {
    const current = years.findIndex((year) => year.id === currentYearId);
    return current < 0 ? [] : years.slice(current);
  }

  // The selected scenario's DCF with the company's discount variables.
  function dcf(currentYearId: number) {
    return calculateDcf({
      years,
      currentYearId,
      prediction,
      fieldIds: valuation.fieldIds,
      wacc: wacc(discountValues),
      terminalGrowth: discountValues.terminal_growth ?? null,
      now: new Date(),
    });
  }

  // The selected scenario's value per share by the valuation multiples, discounted to today as in
  // the valuation tab; null without a scenario or a target year.
  function multipleValuePerShare() {
    const targetYear = targetYears().find((year) => year.id === targetYearId);
    if (!scenario || !targetYear) return null;
    const result = calculateValuation({
      multiples: valuation.multiples,
      values: { ...valuation.values[scenario.id], ...multipleEdits[scenario.id] },
      prediction,
      targetYearId: targetYear.id,
      netDebtFieldId: valuation.fieldIds.net_debt,
      shareCountFieldId: valuation.fieldIds.share_count,
    });
    return presentValuation(result, costOfEquity(discountValues), targetYear.endTime, new Date()).valuePerShare;
  }

  // The multiples the latest stock price gives in the current financial year and the ones after it;
  // nothing without a price or multiples.
  function priceMultiplesTable(columns: ResultColumn[]) {
    const price = stockPrices.at(-1)?.close;
    if (price == null || valuation.multiples.length === 0) return null;
    const yearIds = targetYears()
      .slice(0, PRICE_MULTIPLE_YEARS)
      .map((year) => year.id);
    const shown = columns.filter((column) => yearIds.includes(column.period.financialYearId!));
    const multiples = priceMultiples({
      multiples: valuation.multiples,
      prediction,
      yearIds,
      price,
      netDebtFieldId: valuation.fieldIds.net_debt,
      shareCountFieldId: valuation.fieldIds.share_count,
    });
    return <PriceMultiplesTable multiples={valuation.multiples} columns={shown} values={multiples} />;
  }

  function summaryTab() {
    if (currentYearId == null) return <p className="text-muted-foreground">{t("noYears")}</p>;
    const columns = summaryColumns(years, currentYearId, isEstimated);
    const starred = groups.flatMap((group) => group.fields.filter((field) => field.starred));
    return (
      <>
        {starred.length > 0 && (
          <ResultTable name={t("starredFields")} fields={starred} columns={columns} values={values} />
        )}
        <div className="grid gap-8 lg:grid-cols-2">
          <ValuePerShareTable
            dcf={dcf(currentYearId).valuePerShare}
            multiples={multipleValuePerShare()}
            price={stockPrices.at(-1)?.close ?? null}
          />
          {priceMultiplesTable(columns)}
        </div>
        {resultGraphs(columns, graphs.filter((graph) => graph.starred))}
      </>
    );
  }

  // The DCF's cash flows take the full width; on large screens its value takes 3/8 of it beside the
  // chart of how the value is divided, and the discount variables half.
  function discountingTab() {
    const variables = (
      <div className="lg:w-1/2">
        <DiscountVariablesTable values={discountValues} save={saveDiscount} />
      </div>
    );
    if (currentYearId == null) return variables;
    const result = dcf(currentYearId);
    const unit = years.find((year) => year.id === currentYearId)?.unit ?? "one";
    const yearLabel = (year: EstimateYear) =>
      `${year.name ?? ""}${isEstimated({ reportingSeasonId: null, financialYearId: year.id }) ? "e" : ""}`;
    return (
      <>
        <DcfCashFlowTable dcf={result} years={years} label={yearLabel} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-8">
          <div className="lg:col-span-3">
            <DcfTable dcf={result} unit={unit} />
          </div>
          <div className="lg:col-span-5">
            <DcfValueChart dcf={result} years={years} unit={unit} label={yearLabel} />
          </div>
        </div>
        {variables}
      </>
    );
  }

  async function saveMultiple(scenarioId: number, multipleId: number, value: number | null) {
    const { saved } = await saveMultipleValue({ scenarioId, multipleId, value });
    if (saved)
      setMultipleEdits((edits) => ({ ...edits, [scenarioId]: { ...edits[scenarioId], [multipleId]: value } }));
    return saved;
  }

  async function selectTargetYear(yearId: number) {
    const { saved } = await setValuationTargetYear({ companyId, financialYearId: yearId });
    if (saved) setTargetYearId(yearId);
    return saved;
  }

  async function saveDiscount(variable: DiscountVariable, value: number | null) {
    const { saved } = await saveDiscountVariable({ companyId, variable, value });
    if (saved) setDiscountValues((values) => ({ ...values, [variable]: value }));
    return saved;
  }

  function valuationTab() {
    if (!scenario) return <p className="text-muted-foreground">{t("noScenarios")}</p>;
    if (currentYearId == null) return <p className="text-muted-foreground">{t("noYears")}</p>;
    return (
      <ValuationTab
        scenarioId={scenario.id}
        years={targetYears()}
        prediction={prediction}
        valuation={valuation}
        values={{ ...valuation.values[scenario.id], ...multipleEdits[scenario.id] }}
        discountValues={discountValues}
        price={stockPrices.at(-1)?.close ?? null}
        targetYearId={targetYearId}
        selectTargetYear={selectTargetYear}
        save={(multipleId, value) => saveMultiple(scenario.id, multipleId, value)}
      />
    );
  }

  const tabs: {
    value:
      | "summary"
      | "stockPrice"
      | "quarterly" | "yearly" | "quarterlyEstimates" | "yearlyEstimates" | "valuation" | "discounting";
    content: React.ReactNode;
  }[] = [
    { value: "summary", content: summaryTab() },
    { value: "stockPrice", content: <StockPriceChart prices={stockPrices} /> },
    { value: "quarterly", content: resultTables(quarterlyResultColumns(seasons, isEstimated)) },
    { value: "yearly", content: resultTables(yearlyResultColumns(seasons, isEstimated)) },
    {
      value: "quarterlyEstimates",
      content: estimateTables(
        (current) => quarterlyEstimateColumns(years, current, withData),
        (current) => quarterlyGraphColumns(years, current, isEstimated),
      ),
    },
    {
      value: "yearlyEstimates",
      content: estimateTables(
        (current) => yearlyEstimateColumns(years, current),
        (current) => yearlyGraphColumns(years, current, isEstimated),
      ),
    },
    { value: "valuation", content: valuationTab() },
    { value: "discounting", content: discountingTab() },
  ];

  return (
    <div className="flex flex-col gap-4">
      <EstimateScenarioPicker
        scenarios={scenarios}
        selected={scenario}
        onSelect={select}
      />
      <Tabs defaultValue="summary">
        {/* The tabs fill the width; on narrow screens they scroll sideways. */}
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-10">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-3 text-base">
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
