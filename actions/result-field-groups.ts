"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { EstimateType, ResultFieldType, ValueFormat, YearlyValue } from "@/app/generated/prisma/client";
import { requireUserId } from "@/lib/auth";
import { fieldFormulas, referencedFieldIds, type Formula } from "@/lib/formulas";
import { isReordering } from "@/lib/ordering";
import { prisma } from "@/lib/prisma";

export type ResultFieldSettingsData = {
  id: number;
  name: string;
  type: ResultFieldType | null;
  estimateType: EstimateType;
  yearlyValue: YearlyValue;
  valueFormat: ValueFormat;
  starred: boolean;
  // Formulas of a calculated field; null when the values are entered.
  actualDefinition: Formula | null;
  estimateDefinition: Formula | null;
  // Fields with results or used in another field's formula can't be deleted.
  hasResults: boolean;
  usedInFormulas: boolean;
};

export type ResultFieldGroupSettingsData = { id: number; name: string; fields: ResultFieldSettingsData[] };

// A company's result field groups with their result fields, both in display order.
export async function getResultFieldGroups(companyId: number): Promise<ResultFieldGroupSettingsData[]> {
  await requireUserId();

  const groups = await prisma.resultFieldGroup.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      resultFields: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          type: true,
          estimateType: true,
          yearlyValue: true,
          valueFormat: true,
          starred: true,
          fieldDefinitions: { select: { kind: true, definition: true } },
          _count: { select: { resultRows: true } },
        },
      },
    },
  });

  const withDefinitions = groups.map((group) => ({
    id: group.id,
    name: group.name ?? "",
    fields: group.resultFields.map(({ fieldDefinitions, _count, ...field }) => ({
      ...field,
      name: field.name ?? "",
      ...fieldFormulas(fieldDefinitions),
      hasResults: _count.resultRows > 0,
    })),
  }));
  // A field's own formula may use its previous value, and is deleted with the field.
  const usedInFormulas = new Set(
    withDefinitions.flatMap((group) =>
      group.fields.flatMap((field) =>
        [field.actualDefinition, field.estimateDefinition].flatMap((formula) =>
          formula ? referencedFieldIds(formula).filter((id) => id !== field.id) : [],
        ),
      ),
    ),
  );
  return withDefinitions.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({ ...field, usedInFormulas: usedInFormulas.has(field.id) })),
  }));
}

// Error values are translation keys under ResultFieldGroups.errors.
export type GroupNameError = "required" | "tooLong";

const nameSchema = z.string().trim().min(1, "required").max(100, "tooLong");

function nameError(name: unknown): GroupNameError | undefined {
  const parsed = nameSchema.safeParse(name);
  return parsed.success ? undefined : (parsed.error.issues[0].message as GroupNameError);
}

const idSchema = z.number().int().positive();

// Creates a group after the company's other groups.
export async function createResultFieldGroup(input: {
  companyId: number;
  name: string;
}): Promise<{ error?: GroupNameError }> {
  await requireUserId();

  // Parameters come from the client, so validate them despite the type.
  const error = nameError(input.name);
  if (error) return { error };
  const companyId = idSchema.parse(input.companyId);

  await prisma.$transaction(async (tx) => {
    const { _max } = await tx.resultFieldGroup.aggregate({ where: { companyId }, _max: { order: true } });
    await tx.resultFieldGroup.create({
      data: { companyId, name: input.name.trim(), order: (_max.order ?? -1) + 1 },
    });
  });
  refresh();
  return {};
}

export async function renameResultFieldGroup(input: {
  groupId: number;
  name: string;
}): Promise<{ error?: GroupNameError }> {
  await requireUserId();

  const error = nameError(input.name);
  if (error) return { error };

  await prisma.resultFieldGroup.updateMany({
    where: { id: idSchema.parse(input.groupId) },
    data: { name: input.name.trim() },
  });
  refresh();
  return {};
}

// Deletes the group if it has no result fields. Groups with fields are kept, so deleting a group
// never deletes result rows.
export async function deleteResultFieldGroup(input: { groupId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();

  const { count } = await prisma.resultFieldGroup.deleteMany({
    where: { id: idSchema.parse(input.groupId), resultFields: { none: {} } },
  });
  refresh();
  return { deleted: count > 0 };
}

const reorderSchema = z.object({
  companyId: idSchema,
  groupIds: z.array(idSchema),
});

// Orders the company's result field groups as given. The ids must be exactly the company's groups.
export async function reorderResultFieldGroups(input: {
  companyId: number;
  groupIds: number[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { companyId, groupIds } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const groups = await tx.resultFieldGroup.findMany({ where: { companyId }, select: { id: true } });
    if (!isReordering(groupIds, groups.map((group) => group.id))) return false;

    for (const [order, id] of groupIds.entries())
      await tx.resultFieldGroup.update({ where: { id }, data: { order } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}
