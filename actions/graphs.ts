"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { GraphAxis, GraphFieldType } from "@/app/generated/prisma/enums";
import { requireUserId } from "@/lib/auth";
import { isReordering } from "@/lib/ordering";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "@/lib/prisma-errors";

export type GraphFieldData = { id: number; resultFieldId: number; type: GraphFieldType; axis: GraphAxis };

export type GraphData = { id: number; name: string; starred: boolean; fields: GraphFieldData[] };

// A company's graphs with their fields, both in display order.
export async function getGraphs(companyId: number): Promise<GraphData[]> {
  await requireUserId();

  return prisma.graph.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      starred: true,
      fields: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, resultFieldId: true, type: true, axis: true },
      },
    },
  });
}

// Error values are translation keys under Graphs.errors.
export type GraphNameError = "required" | "tooLong" | "nameTaken";

const nameSchema = z.string().trim().min(1, "required").max(100, "tooLong");

function nameError(name: unknown): GraphNameError | undefined {
  const parsed = nameSchema.safeParse(name);
  return parsed.success ? undefined : (parsed.error.issues[0].message as GraphNameError);
}

const idSchema = z.number().int().positive();

// Whether another graph of the company has the name, ignoring case.
async function nameTaken(companyId: number, name: string, graphId?: number) {
  const count = await prisma.graph.count({
    where: { companyId, name: { equals: name, mode: "insensitive" }, id: { not: graphId } },
  });
  return count > 0;
}

// Creates a graph without fields after the company's other graphs.
export async function createGraph(input: { companyId: number; name: string }): Promise<{ error?: GraphNameError }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const error = nameError(input.name);
  if (error) return { error };
  const companyId = idSchema.parse(input.companyId);
  const name = input.name.trim();
  if (await nameTaken(companyId, name)) return { error: "nameTaken" };

  try {
    await prisma.$transaction(async (tx) => {
      const { _max } = await tx.graph.aggregate({ where: { companyId }, _max: { order: true } });
      await tx.graph.create({ data: { companyId, name, order: (_max.order ?? -1) + 1 } });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) return { error: "nameTaken" };
    throw e;
  }
  refresh();
  return {};
}

export async function renameGraph(input: { graphId: number; name: string }): Promise<{ error?: GraphNameError }> {
  await requireUserId();

  const error = nameError(input.name);
  if (error) return { error };
  const graphId = idSchema.parse(input.graphId);
  const name = input.name.trim();
  const { companyId } = await prisma.graph.findUniqueOrThrow({ where: { id: graphId }, select: { companyId: true } });
  if (await nameTaken(companyId, name, graphId)) return { error: "nameTaken" };

  try {
    await prisma.graph.update({ where: { id: graphId }, data: { name } });
  } catch (e) {
    if (isUniqueConstraintError(e)) return { error: "nameTaken" };
    throw e;
  }
  refresh();
  return {};
}

// Deletes the graph with its fields. The result fields are kept.
export async function deleteGraph(input: { graphId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();
  const graphId = idSchema.parse(input.graphId);

  const { count } = await prisma.graph.deleteMany({ where: { id: graphId } });
  refresh();
  return { deleted: count > 0 };
}

const starSchema = z.object({
  graphId: idSchema,
  starred: z.boolean(),
});

export async function setGraphStarred(input: { graphId: number; starred: boolean }) {
  await requireUserId();
  const { graphId, starred } = starSchema.parse(input);

  await prisma.graph.update({ where: { id: graphId }, data: { starred } });
  refresh();
}

const reorderGraphsSchema = z.object({
  companyId: idSchema,
  graphIds: z.array(idSchema),
});

// Orders the company's graphs as given. The ids must be exactly the company's graphs.
export async function reorderGraphs(input: { companyId: number; graphIds: number[] }): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = reorderGraphsSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, graphIds } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const graphs = await tx.graph.findMany({ where: { companyId }, select: { id: true } });
    if (!isReordering(graphIds, graphs.map((graph) => graph.id))) return false;

    for (const [order, id] of graphIds.entries()) await tx.graph.update({ where: { id }, data: { order } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}

const addFieldSchema = z.object({
  graphId: idSchema,
  resultFieldId: idSchema,
});

// Adds a result field of the graph's company to the graph as a line on the left axis, after its
// other fields. A field already in the graph isn't added again.
export async function addGraphField(input: { graphId: number; resultFieldId: number }): Promise<{ saved: boolean }> {
  await requireUserId();
  const { graphId, resultFieldId } = addFieldSchema.parse(input);

  const saved = await prisma.$transaction(async (tx) => {
    const graph = await tx.graph.findUniqueOrThrow({ where: { id: graphId }, select: { companyId: true } });
    const field = await tx.resultField.count({
      where: { id: resultFieldId, resultFieldGroup: { companyId: graph.companyId } },
    });
    if (field === 0) throw new Error("Result field of another company");

    const existing = await tx.graphField.count({ where: { graphId, resultFieldId } });
    if (existing > 0) return false;
    const { _max } = await tx.graphField.aggregate({ where: { graphId }, _max: { order: true } });
    await tx.graphField.create({ data: { graphId, resultFieldId, order: (_max.order ?? -1) + 1 } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}

const updateFieldSchema = z.object({
  graphFieldId: idSchema,
  type: z.enum(GraphFieldType),
  axis: z.enum(GraphAxis),
});

// Sets whether the field is shown as a line or bars, and against which y-axis.
export async function updateGraphField(input: {
  graphFieldId: number;
  type: GraphFieldType;
  axis: GraphAxis;
}): Promise<{ saved: boolean }> {
  await requireUserId();
  const { graphFieldId, type, axis } = updateFieldSchema.parse(input);

  const { count } = await prisma.graphField.updateMany({ where: { id: graphFieldId }, data: { type, axis } });
  refresh();
  return { saved: count > 0 };
}

// Removes the field from the graph. The result field itself is kept.
export async function removeGraphField(input: { graphFieldId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();
  const graphFieldId = idSchema.parse(input.graphFieldId);

  const { count } = await prisma.graphField.deleteMany({ where: { id: graphFieldId } });
  refresh();
  return { deleted: count > 0 };
}

const reorderFieldsSchema = z.object({
  graphId: idSchema,
  graphFieldIds: z.array(idSchema),
});

// Orders the graph's fields as given. The ids must be exactly the graph's fields.
export async function reorderGraphFields(input: {
  graphId: number;
  graphFieldIds: number[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = reorderFieldsSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { graphId, graphFieldIds } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const fields = await tx.graphField.findMany({ where: { graphId }, select: { id: true } });
    if (!isReordering(graphFieldIds, fields.map((field) => field.id))) return false;

    for (const [order, id] of graphFieldIds.entries())
      await tx.graphField.update({ where: { id }, data: { order } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}
