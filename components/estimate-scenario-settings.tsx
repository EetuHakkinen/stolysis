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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// Company settings section listing the company's estimate scenarios, with buttons for creating,
// renaming and deleting them. The actions refresh the page, which loads the updated list.
export function EstimateScenarioSettings({
  companyId,
  scenarios,
}: {
  companyId: number;
  scenarios: EstimateScenarioSummary[];
}) {
  const t = useTranslations("Estimates");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("scenarios")}</h2>
        <ScenarioNameDialog
          title={t("createTitle")}
          save={async (name) => (await createEstimateScenario({ companyId, name })).error}
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon />
              {t("create")}
            </Button>
          }
        />
      </div>
      <Table>
        <TableBody>
          {scenarios.length === 0 ? (
            <TableRow>
              <TableCell className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          ) : (
            scenarios.map((scenario) => (
              <TableRow key={scenario.id}>
                <TableCell className="font-medium">{scenario.name}</TableCell>
                <TableCell className="w-0">
                  <div className="flex justify-end gap-1">
                    <ScenarioNameDialog
                      title={t("renameTitle")}
                      initialName={scenario.name}
                      save={async (name) =>
                        (await renameEstimateScenario({ scenarioId: scenario.id, name })).error
                      }
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("rename")}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    <DeleteScenarioDialog
                      name={scenario.name}
                      remove={() => deleteEstimateScenario({ scenarioId: scenario.id })}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                          <Trash2Icon />
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
