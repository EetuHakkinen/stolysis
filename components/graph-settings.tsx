"use client";

import { useOptimistic, useTransition } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  addGraphField,
  createGraph,
  deleteGraph,
  removeGraphField,
  renameGraph,
  reorderGraphFields,
  reorderGraphs,
  setGraphStarred,
  updateGraphField,
  type GraphData,
  type GraphFieldData,
  type GraphNameError,
} from "@/actions/graphs";
import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import { GraphAxis, GraphFieldType } from "@/app/generated/prisma/enums";
import { DeleteDialog } from "@/components/delete-dialog";
import { NameDialog } from "@/components/name-dialog";
import { OptionSelect } from "@/components/option-select";
import { SortableTableBody, SortableTableRow } from "@/components/sortable-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

// Company settings section for the graphs shown below the result and estimate tables: a table of
// the graphs in display order, with buttons for creating, renaming and deleting them, followed by
// each graph's result fields. Graphs and their fields are reordered by dragging, and graphs are
// starred with the star button to show them in the summary tab; changes show right away and stay
// once the refreshed page has loaded them.
export function GraphSettings({
  companyId,
  graphs,
  groups,
}: {
  companyId: number;
  graphs: GraphData[];
  // The company's result fields by group, which graphs can show.
  groups: ResultFieldGroupSettingsData[];
}) {
  const t = useTranslations("Graphs");
  const [shown, setShown] = useOptimistic(graphs);
  const [, startTransition] = useTransition();
  const errorMessage = (error: GraphNameError | undefined) => error && t(`errors.${error}`);

  function move(from: number, to: number) {
    const reordered = arrayMove(shown, from, to);
    startTransition(async () => {
      setShown(reordered);
      await reorderGraphs({ companyId, graphIds: reordered.map((graph) => graph.id) });
    });
  }

  function toggleStar(graphId: number, starred: boolean) {
    startTransition(async () => {
      setShown(shown.map((graph) => (graph.id === graphId ? { ...graph, starred } : graph)));
      await setGraphStarred({ graphId, starred });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <NameDialog
          title={t("createTitle")}
          save={async (name) => errorMessage((await createGraph({ companyId, name })).error)}
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
          <SortableTableBody ids={shown.map((graph) => graph.id)} onMove={move}>
            {shown.map((graph) => (
              <SortableTableRow key={graph.id} id={graph.id} handleLabel={t("move", { name: graph.name })}>
                <TableCell className="font-medium">{graph.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("fieldCount", { count: graph.fields.length })}
                </TableCell>
                <TableCell className="w-0">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(graph.starred ? "unstar" : "star", { name: graph.name })}
                      aria-pressed={graph.starred}
                      onClick={() => toggleStar(graph.id, !graph.starred)}
                    >
                      <StarIcon className={graph.starred ? "fill-yellow-400 text-yellow-400" : undefined} />
                    </Button>
                    <NameDialog
                      title={t("renameTitle")}
                      initialName={graph.name}
                      save={async (name) => errorMessage((await renameGraph({ graphId: graph.id, name })).error)}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("rename")}>
                          <PencilIcon />
                        </Button>
                      }
                    />
                    <DeleteDialog
                      title={t("deleteTitle")}
                      description={t("deleteDescription", { name: graph.name })}
                      remove={() => deleteGraph({ graphId: graph.id })}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
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
      {shown.map((graph) => (
        <GraphFields key={graph.id} graph={graph} groups={groups} />
      ))}
    </section>
  );
}

// One graph's result fields, each with its type and y-axis, and a select for adding a field that
// isn't in the graph yet. Changes show right away and stay once the refreshed page has loaded them.
function GraphFields({ graph, groups }: { graph: GraphData; groups: ResultFieldGroupSettingsData[] }) {
  const t = useTranslations("Graphs");
  const [fields, setFields] = useOptimistic(graph.fields);
  const [, startTransition] = useTransition();
  const names = new Map(groups.flatMap((group) => group.fields.map((field) => [field.id, field.name])));
  const inGraph = new Set(fields.map((field) => field.resultFieldId));
  const addable = groups
    .map((group) => ({ ...group, fields: group.fields.filter((field) => !inGraph.has(field.id)) }))
    .filter((group) => group.fields.length > 0);

  function move(from: number, to: number) {
    const reordered = arrayMove(fields, from, to);
    startTransition(async () => {
      setFields(reordered);
      await reorderGraphFields({ graphId: graph.id, graphFieldIds: reordered.map((field) => field.id) });
    });
  }

  function update(field: GraphFieldData, changes: Partial<Pick<GraphFieldData, "type" | "axis">>) {
    const updated = { ...field, ...changes };
    startTransition(async () => {
      setFields(fields.map((other) => (other.id === field.id ? updated : other)));
      await updateGraphField({ graphFieldId: field.id, type: updated.type, axis: updated.axis });
    });
  }

  function remove(field: GraphFieldData) {
    startTransition(async () => {
      setFields(fields.filter((other) => other.id !== field.id));
      await removeGraphField({ graphFieldId: field.id });
    });
  }

  function add(resultFieldId: number) {
    startTransition(async () => {
      await addGraphField({ graphId: graph.id, resultFieldId });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-semibold">{graph.name}</h3>
        {addable.length > 0 && (
          <Select
            // Starts over with the placeholder after each added field.
            key={fields.length}
            value={null as number | null}
            onValueChange={(value) => {
              if (value != null) add(value);
            }}
          >
            <SelectTrigger size="sm" aria-label={t("addField")}>
              <PlusIcon />
              <SelectValue placeholder={t("addField")} />
            </SelectTrigger>
            <SelectContent>
              {addable.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {group.fields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <Table>
        {fields.length === 0 ? (
          <TableBody>
            <TableRow>
              <TableCell className="text-center text-muted-foreground">{t("noFields")}</TableCell>
            </TableRow>
          </TableBody>
        ) : (
          <SortableTableBody ids={fields.map((field) => field.id)} onMove={move}>
            {fields.map((field) => {
              const name = names.get(field.resultFieldId) ?? "";
              return (
                <SortableTableRow key={field.id} id={field.id} handleLabel={t("moveField", { name })}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="w-36">
                    <OptionSelect
                      options={Object.values(GraphFieldType).map((value) => ({ value, label: t(`types.${value}`) }))}
                      value={field.type}
                      onChange={(type) => update(field, { type })}
                    />
                  </TableCell>
                  <TableCell className="w-36">
                    <OptionSelect
                      options={Object.values(GraphAxis).map((value) => ({ value, label: t(`axes.${value}`) }))}
                      value={field.axis}
                      onChange={(axis) => update(field, { axis })}
                    />
                  </TableCell>
                  <TableCell className="w-0">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("removeField", { name })}
                      onClick={() => remove(field)}
                    >
                      <XIcon />
                    </Button>
                  </TableCell>
                </SortableTableRow>
              );
            })}
          </SortableTableBody>
        )}
      </Table>
    </div>
  );
}
