"use client";

import { useMemo, useOptimistic, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  createResultFieldGroup,
  deleteResultFieldGroup,
  renameResultFieldGroup,
  reorderResultFieldGroups,
  type GroupNameError,
  type ResultFieldGroupSettingsData,
} from "@/actions/result-field-groups";
import { DeleteDialog } from "@/components/delete-dialog";
import { NameDialog } from "@/components/name-dialog";
import { SortableTableBody, SortableTableRow } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// What the group table does with the groups: save them to a company's settings, or change a draft
// of a company being created. Create and rename return the name's validation error.
export type ResultFieldGroupActions = {
  create: (name: string) => Promise<GroupNameError | undefined>;
  rename: (groupId: number, name: string) => Promise<GroupNameError | undefined>;
  remove: (groupId: number) => Promise<unknown>;
  reorder: (groupIds: number[]) => Promise<unknown>;
};

// Company settings section listing the company's result field groups, saved to its settings.
export function ResultFieldGroupSettings({
  companyId,
  groups,
}: {
  companyId: number;
  groups: ResultFieldGroupSettingsData[];
}) {
  const actions = useMemo<ResultFieldGroupActions>(
    () => ({
      create: async (name) => (await createResultFieldGroup({ companyId, name })).error,
      rename: async (groupId, name) => (await renameResultFieldGroup({ groupId, name })).error,
      remove: (groupId) => deleteResultFieldGroup({ groupId }),
      reorder: (groupIds) => reorderResultFieldGroups({ companyId, groupIds }),
    }),
    [companyId],
  );
  return <ResultFieldGroupList groups={groups} actions={actions} />;
}

// Section listing result field groups in display order, with buttons for creating, renaming and
// deleting them. Groups are reordered by dragging; the new order shows right away and stays once
// the groups have been updated. Only groups without result fields have a delete button.
export function ResultFieldGroupList({
  groups,
  actions,
}: {
  groups: ResultFieldGroupSettingsData[];
  actions: ResultFieldGroupActions;
}) {
  const t = useTranslations("ResultFieldGroups");
  const [shown, setShown] = useOptimistic(groups);
  const [, startTransition] = useTransition();
  const errorMessage = (error: GroupNameError | undefined) => error && t(`errors.${error}`);

  function move(from: number, to: number) {
    const reordered = arrayMove(shown, from, to);
    startTransition(async () => {
      setShown(reordered);
      await actions.reorder(reordered.map((group) => group.id));
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <NameDialog
          title={t("createTitle")}
          save={async (name) => errorMessage(await actions.create(name))}
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
          <SortableTableBody ids={shown.map((group) => group.id)} onMove={move}>
            {shown.map((group) => (
              <SortableTableRow key={group.id} id={group.id} handleLabel={t("move", { name: group.name })}>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("fieldCount", { count: group.fields.length })}
                </TableCell>
                <TableCell className="w-0">
                  <div className="flex justify-end gap-1">
                    <NameDialog
                      title={t("renameTitle")}
                      initialName={group.name}
                      save={async (name) => errorMessage(await actions.rename(group.id, name))}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("rename")}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    {group.fields.length === 0 && (
                      <DeleteDialog
                        title={t("deleteTitle")}
                        description={t("deleteDescription", { name: group.name })}
                        remove={() => actions.remove(group.id)}
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
    </section>
  );
}
