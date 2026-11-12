"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createEstimateScenario,
  deleteEstimateScenario,
  renameEstimateScenario,
  type EstimateScenarioSummary,
} from "@/actions/estimates";
import { DeleteScenarioDialog } from "@/components/delete-scenario-dialog";
import { ScenarioNameDialog } from "@/components/scenario-name-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Select for the estimate scenario shown in the estimate tabs, with buttons for creating,
// renaming and deleting scenarios.
export function EstimateScenarioPicker({
  companyId,
  scenarios,
  selected,
  onSelect,
}: {
  companyId: number;
  scenarios: EstimateScenarioSummary[];
  selected: EstimateScenarioSummary | undefined;
  onSelect: (scenarioId: number | undefined) => void;
}) {
  const t = useTranslations("Estimates");
  const items = scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }));

  async function create(name: string) {
    const { id, error } = await createEstimateScenario({ companyId, name });
    if (id) onSelect(id);
    return error;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("scenario")}</span>
      {selected && (
        <Select
          items={items}
          value={selected.id}
          onValueChange={(value) => onSelect(value ?? undefined)}
        >
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
      )}
      <ScenarioNameDialog
        title={t("createTitle")}
        save={create}
        trigger={
          <Button variant="outline" size="sm">
            <PlusIcon />
            {t("create")}
          </Button>
        }
      />
      {selected && (
        <>
          <ScenarioNameDialog
            key={selected.id}
            title={t("renameTitle")}
            initialName={selected.name}
            save={async (name) =>
              (await renameEstimateScenario({ scenarioId: selected.id, name })).error
            }
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("rename")}>
                <PencilIcon />
              </Button>
            }
          />
          <DeleteScenarioDialog
            name={selected.name}
            remove={async () => {
              await deleteEstimateScenario({ scenarioId: selected.id });
              onSelect(scenarios.find((scenario) => scenario.id !== selected.id)?.id);
            }}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                <Trash2Icon />
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
