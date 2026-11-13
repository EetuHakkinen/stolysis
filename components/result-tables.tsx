import { getTranslations } from "next-intl/server";
import type { CompanyEstimates } from "@/actions/estimates";
import type { GraphData } from "@/actions/graphs";
import type { DiscountValues } from "@/lib/discounting";
import type { CompanyResults } from "@/actions/results";
import type { CompanyValuationData } from "@/actions/valuation";
import { ResultTabs } from "@/components/result-tabs";

// A valuation summary tab of the starred fields and the graphs, then result field groups in
// quarterly and yearly tabs: one table per group, with result fields as
// rows and reporting seasons or financial years as columns. Followed by the estimate tabs of the
// selected scenario, whose predicted values also fill the results without data, the scenario's
// valuation and the company's discount variables. The company's graphs are shown below the result
// and estimate tables.
export async function ResultTables({
  companyId,
  results: { seasons, groups },
  estimates,
  graphs,
  valuation,
  discountVariables,
}: {
  companyId: number;
  results: CompanyResults;
  estimates: CompanyEstimates;
  graphs: GraphData[];
  valuation: CompanyValuationData;
  discountVariables: DiscountValues;
}) {
  const t = await getTranslations("Results");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {groups.length === 0 || seasons.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ResultTabs
          companyId={companyId}
          seasons={seasons}
          groups={groups}
          estimates={estimates}
          graphs={graphs}
          valuation={valuation}
          discountVariables={discountVariables}
        />
      )}
    </section>
  );
}
