"use client";

import { useOptimistic, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import {
  createResultField,
  deleteResultField,
  reorderResultFields,
  setResultFieldStarred,
  updateResultField,
  type ResultFieldErrors,
  type ResultFieldInput,
} from "@/actions/result-fields";
import { DeleteDialog } from "@/components/delete-dialog";
import { useFormatFormula } from "@/components/formula-editor";
import { ResultFieldDialog } from "@/components/result-field-dialog";
import { SortableTableBody, SortableTableRow } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// What the result field tables do with the fields: save them to a company's settings, or change a
// draft of a company being created. Create and update return the validation errors.
export type ResultFieldActions = {
  create: (input: ResultFieldInput) => Promise<ResultFieldErrors | undefined>;
  update: (fieldId: number, input: ResultFieldInput) => Promise<ResultFieldErrors | undefined>;
  remove: (fieldId: number) => Promise<unknown>;
  reorder: (groupId: number, fieldIds: number[]) => Promise<unknown>;
  setStarred: (fieldId: number, starred: boolean) => Promise<unknown>;
};

const SETTINGS_ACTIONS: ResultFieldActions = {
  create: async (input) => (await createResultField(input)).errors,
  update: async (fieldId, input) => (await updateResultField({ fieldId, ...input })).errors,
  remove: (fieldId) => deleteResultField({ fieldId }),
  reorder: (groupId, fieldIds) => reorderResultFields({ groupId, fieldIds }),
  setStarred: (fieldId, starred) => setResultFieldStarred({ fieldId, starred }),
};

// Company settings section with a table of result fields for each result field group, saved to the
// company's settings.
export function ResultFieldSettings({ groups }: { groups: ResultFieldGroupSettingsData[] }) {
  return <ResultFieldList groups={groups} actions={SETTINGS_ACTIONS} />;
}

// Section with a table of result fields for each result field group, in display
// order. Fields are created, edited (also moved to another group) and deleted with the buttons, and
// reordered within their group by dragging, and starred with the star button. Only fields without results that no other field's
// formula uses have a delete button; the edit dialog tells why a field can't be deleted. Calculated fields have badges with their formulas as tooltips.
// fieldMarker adds something after a field's name, e.g. whether it was found in a report.
export function ResultFieldList({
  groups,
  actions,
  fieldMarker,
}: {
  groups: ResultFieldGroupSettingsData[];
  actions: ResultFieldActions;
  fieldMarker?: (fieldId: number) => React.ReactNode;
}) {
  const t = useTranslations("ResultFields");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">{t("noGroups")}</p>
      ) : (
        groups.map((group) => (
          <GroupFields key={group.id} group={group} groups={groups} actions={actions} fieldMarker={fieldMarker} />
        ))
      )}
    </section>
  );
}

// One group's fields. The new order after dragging and a changed star show right away and stays once the refreshed
// page has loaded it.
function GroupFields({
  group,
  groups,
  actions,
  fieldMarker,
}: {
  group: ResultFieldGroupSettingsData;
  groups: ResultFieldGroupSettingsData[];
  actions: ResultFieldActions;
  fieldMarker?: (fieldId: number) => React.ReactNode;
}) {
  const t = useTranslations("ResultFields");
  const [fields, setFields] = useOptimistic(group.fields);
  const [, startTransition] = useTransition();
  const formatFormula = useFormatFormula(groups);

  function move(from: number, to: number) {
    const reordered = arrayMove(fields, from, to);
    startTransition(async () => {
      setFields(reordered);
      await actions.reorder(group.id, reordered.map((field) => field.id));
    });
  }

  function toggleStar(fieldId: number, starred: boolean) {
    startTransition(async () => {
      setFields(fields.map((field) => (field.id === fieldId ? { ...field, starred } : field)));
      await actions.setStarred(fieldId, starred);
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
            valueFormat: "money",
            estimateType: "relative",
            type: null,
            actualDefinition: null,
            estimateDefinition: null,
          }}
          save={actions.create}
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
                    {fieldMarker?.(field.id)}
                    {field.type && <Badge variant="secondary">{t(`types.${field.type}`)}</Badge>}
                    {field.valueFormat !== "money" && (
                      <Badge variant="secondary">{t(`valueFormats.${field.valueFormat}`)}</Badge>
                    )}
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
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(field.starred ? "unstar" : "star", { name: field.name })}
                      aria-pressed={field.starred}
                      onClick={() => toggleStar(field.id, !field.starred)}
                    >
                      <StarIcon className={field.starred ? "fill-yellow-400 text-yellow-400" : undefined} />
                    </Button>
                    <ResultFieldDialog
                      title={t("editTitle")}
                      groups={groups}
                      fieldId={field.id}
                      usage={{ hasResults: field.hasResults, usedBy: field.usedBy }}
                      initialValues={{
                        groupId: group.id,
                        name: field.name,
                        yearlyValue: field.yearlyValue,
                        valueFormat: field.valueFormat,
                        estimateType: field.estimateType,
                        type: field.type,
                        actualDefinition: field.actualDefinition,
                        estimateDefinition: field.estimateDefinition,
                      }}
                      save={(values) => actions.update(field.id, values)}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    {!field.hasResults && field.usedBy.length === 0 && (
                      <DeleteDialog
                        title={t("deleteTitle")}
                        description={t("deleteDescription", { name: field.name })}
                        remove={() => actions.remove(field.id)}
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
