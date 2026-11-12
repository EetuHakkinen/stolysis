"use client";

import { useTranslations } from "next-intl";
import type { EstimateScenarioSummary } from "@/actions/estimates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Select for the estimate scenario shown in the estimate tabs. Scenarios are created, renamed and
// deleted in the company settings.
export function EstimateScenarioPicker({
  scenarios,
  selected,
  onSelect,
}: {
  scenarios: EstimateScenarioSummary[];
  selected: EstimateScenarioSummary | undefined;
  onSelect: (scenarioId: number | undefined) => void;
}) {
  const t = useTranslations("Estimates");
  if (!selected) return null;
  const items = scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("scenario")}</span>
      <Select items={items} value={selected.id} onValueChange={(value) => onSelect(value ?? undefined)}>
        <SelectTrigger className="min-w-40" aria-label={t("scenario")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
