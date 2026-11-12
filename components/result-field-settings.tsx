"use client";

import { useOptimistic, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import {
  createResultField,
  deleteResultField,
  reorderResultFields,
  updateResultField,
} from "@/actions/result-fields";
import { DeleteDialog } from "@/components/delete-dialog";
import { useFormatFormula } from "@/components/formula-editor";
import { ResultFieldDialog } from "@/components/result-field-dialog";
import { SortableTableBody, SortableTableRow } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// Company settings section with a table of result fields for each result field group, in display
// order. Fields are created, edited (also moved to another group) and deleted with the buttons, and
// reordered within their group by dragging. Only fields without results that no other field's
// formula uses have a delete button. Calculated fields have badges with their formulas as tooltips.
export function ResultFieldSettings({ groups }: { groups: ResultFieldGroupSettingsData[] }) {
  const t = useTranslations("ResultFields");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">{t("noGroups")}</p>
      ) : (
        groups.map((group) => <GroupFields key={group.id} group={group} groups={groups} />)
      )}
    </section>
  );
}

// One group's fields. The new order after dragging shows right away and stays once the refreshed
// page has loaded it.
function GroupFields({
  group,
  groups,
}: {
  group: ResultFieldGroupSettingsData;
  groups: ResultFieldGroupSettingsData[];
}) {
  const t = useTranslations("ResultFields");
  const [fields, setFields] = useOptimistic(group.fields);
  const [, startTransition] = useTransition();
  const formatFormula = useFormatFormula(groups);

  function move(from: number, to: number) {
    const reordered = arrayMove(fields, from, to);
    startTransition(async () => {
      setFields(reordered);
      await reorderResultFields({ groupId: group.id, fieldIds: reordered.map((field) => field.id) });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">{group.name}</h3>
        <ResultFieldDialog
          title={t("createTitle")}
          groups={groups}
          initialValues={{
            groupId: group.id,
            name: "",
            yearlyValue: "sum",
            estimateType: "relative",
            type: null,
            actualDefinition: null,
            estimateDefinition: null,
          }}
          save={async (values) => (await createResultField(values)).errors}
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon />
              {t("create")}
            </Button>
          }
        />
      </div>
      <Table>
        {fields.length === 0 ? (
          <TableBody>
            <TableRow>
              <TableCell className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <SortableTableBody ids={fields.map((field) => field.id)} onMove={move}>
            {fields.map((field) => (
              <SortableTableRow key={field.id} id={field.id} handleLabel={t("move", { name: field.name })}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{field.name}</span>
                    {field.type && <Badge variant="secondary">{t(`types.${field.type}`)}</Badge>}
                    {field.actualDefinition && (
                      <Badge variant="outline" title={formatFormula(field.actualDefinition)}>
                        {t("calculatedActual")}
                      </Badge>
                    )}
                    {field.estimateDefinition && (
                      <Badge variant="outline" title={formatFormula(field.estimateDefinition)}>
                        {t("calculatedEstimate")}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{t(`yearlyValues.${field.yearlyValue}`)}</TableCell>
                <TableCell className="text-muted-foreground">{t(`estimateTypes.${field.estimateType}`)}</TableCell>
                <TableCell className="w-0">
                  <div className="flex justify-end gap-1">
                    <ResultFieldDialog
                      title={t("editTitle")}
                      groups={groups}
                      fieldId={field.id}
                      initialValues={{
                        groupId: group.id,
                        name: field.name,
                        yearlyValue: field.yearlyValue,
                        estimateType: field.estimateType,
                        type: field.type,
                        actualDefinition: field.actualDefinition,
                        estimateDefinition: field.estimateDefinition,
                      }}
                      save={async (values) => (await updateResultField({ fieldId: field.id, ...values })).errors}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    {!field.hasResults && !field.usedInFormulas && (
                      <DeleteDialog
                        title={t("deleteTitle")}
                        description={t("deleteDescription", { name: field.name })}
                        remove={() => deleteResultField({ fieldId: field.id })}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                            <Trash2Icon />
                          </Button>
                        }
                      />
                    )}
                  </div>
                </TableCell>
              </SortableTableRow>
            ))}
          </SortableTableBody>
        )}
      </Table>
    </div>
  );
}
