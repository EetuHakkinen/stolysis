"use client";

import { useOptimistic, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import {
  createValuationMultiple,
  deleteValuationMultiple,
  reorderValuationMultiples,
  updateValuationMultiple,
  type ValuationMultipleSummary,
} from "@/actions/valuation";
import { DeleteDialog } from "@/components/delete-dialog";
import { SortableTableBody, SortableTableRow } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ValuationMultipleDialog } from "@/components/valuation-multiple-dialog";

// Company settings section for the valuation multiples: a table of the multiples in display order
// with their result field and basis, and buttons for creating, editing and deleting them. Multiples
// are reordered by dragging; the new order shows right away and stays once the refreshed page has
// loaded it.
export function ValuationMultipleSettings({
  companyId,
  multiples,
  groups,
}: {
  companyId: number;
  multiples: ValuationMultipleSummary[];
  // The company's result fields by group, which multiples can be based on.
  groups: ResultFieldGroupSettingsData[];
}) {
  const t = useTranslations("ValuationMultiples");
  const [shown, setShown] = useOptimistic(multiples);
  const [, startTransition] = useTransition();
  const fieldNames = new Map(groups.flatMap((group) => group.fields.map((field) => [field.id, field.name])));

  function move(from: number, to: number) {
    const reordered = arrayMove(shown, from, to);
    startTransition(async () => {
      setShown(reordered);
      await reorderValuationMultiples({ companyId, multipleIds: reordered.map((multiple) => multiple.id) });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <ValuationMultipleDialog
          title={t("createTitle")}
          groups={groups}
          initialValues={{ name: "", resultFieldId: null, basis: "enterprise_value" }}
          save={async (values) => (await createValuationMultiple({ companyId, ...values })).errors}
          trigger={
            <Button variant="outline" size="sm">
              <PlusIcon />
              {t("create")}
            </Button>
          }
        />
      </div>
      <Table>
        {shown.length === 0 ? (
          <TableBody>
            <TableRow>
              <TableCell className="text-center text-muted-foreground">{t("empty")}</TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <SortableTableBody ids={shown.map((multiple) => multiple.id)} onMove={move}>
            {shown.map((multiple) => (
              <SortableTableRow key={multiple.id} id={multiple.id} handleLabel={t("move", { name: multiple.name })}>
                <TableCell className="font-medium">{multiple.name}</TableCell>
                <TableCell className="text-muted-foreground">{fieldNames.get(multiple.resultFieldId)}</TableCell>
                <TableCell className="text-muted-foreground">{t(`bases.${multiple.basis}`)}</TableCell>
                <TableCell className="w-0">
                  <div className="flex justify-end gap-1">
                    <ValuationMultipleDialog
                      title={t("editTitle")}
                      groups={groups}
                      initialValues={multiple}
                      save={async (values) =>
                        (await updateValuationMultiple({ multipleId: multiple.id, ...values })).errors
                      }
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("edit", { name: multiple.name })}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    <DeleteDialog
                      title={t("deleteTitle")}
                      description={t("deleteDescription", { name: multiple.name })}
                      remove={() => deleteValuationMultiple({ multipleId: multiple.id })}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("delete", { name: multiple.name })}>
                          <Trash2Icon />
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </SortableTableRow>
            ))}
          </SortableTableBody>
        )}
      </Table>
    </section>
  );
}
