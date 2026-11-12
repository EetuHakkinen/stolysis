import { getTranslations } from "next-intl/server";
import type { CompanyEstimates } from "@/actions/estimates";
import type { CompanyResults } from "@/actions/results";
import { ResultTabs } from "@/components/result-tabs";

// Result field groups in quarterly and yearly tabs: one table per group, with result fields as
// rows and reporting seasons or financial years as columns. Followed by the estimate tabs of the
// selected scenario, whose predicted values also fill the results without data.
export async function ResultTables({
  companyId,
  results: { seasons, groups },
  estimates,
  scenarioId,
}: {
  companyId: number;
  results: CompanyResults;
  estimates: CompanyEstimates;
  scenarioId: number | undefined;
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
          initialScenarioId={scenarioId}
        />
      )}
    </section>
  );
}
