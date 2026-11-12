"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { EstimateType, ResultFieldType, YearlyValue } from "@/app/generated/prisma/enums";
import { requireUserId } from "@/lib/auth";
import { isReordering } from "@/lib/ordering";
import { prisma } from "@/lib/prisma";

export type ResultFieldInput = {
  groupId: number;
  name: string;
  yearlyValue: YearlyValue;
  estimateType: EstimateType;
  type: ResultFieldType | null;
};

// Error values are translation keys under ResultFields.errors.
export type ResultFieldError = "required" | "tooLong" | "typeTaken";
export type ResultFieldErrors = Partial<Record<"name" | "type", ResultFieldError>>;

const idSchema = z.number().int().positive();

const fieldSchema = z.object({
  groupId: idSchema,
  name: z.string().trim().min(1, "required").max(100, "tooLong"),
  yearlyValue: z.enum(YearlyValue),
  estimateType: z.enum(EstimateType),
  type: z.enum(ResultFieldType).nullable(),
});

// Validates the input and checks that its group belongs to the company. Errors are only returned
// for the name; other invalid values can't come from the form, so they throw.
async function parseField(
  tx: Prisma.TransactionClient,
  input: ResultFieldInput,
  fieldId?: number,
): Promise<{ data?: z.infer<typeof fieldSchema>; errors?: ResultFieldErrors }> {
  const parsed = fieldSchema.safeParse(input);
  if (!parsed.success) {
    const nameIssue = parsed.error.issues.find((issue) => issue.path[0] === "name");
    if (nameIssue) return { errors: { name: nameIssue.message as ResultFieldError } };
    throw parsed.error;
  }
  const data = parsed.data;

  const group = await tx.resultFieldGroup.findUniqueOrThrow({
    where: { id: data.groupId },
    select: { companyId: true },
  });
  // Calculations rely on there being at most one field of each special type per company.
  if (data.type) {
    const taken = await tx.resultField.count({
      where: { type: data.type, resultFieldGroup: { companyId: group.companyId }, id: { not: fieldId } },
    });
    if (taken > 0) return { errors: { type: "typeTaken" } };
  }
  return { data };
}

// The next order in the group, so a field added or moved there goes last.
async function nextOrder(tx: Prisma.TransactionClient, groupId: number) {
  const { _max } = await tx.resultField.aggregate({ where: { resultFieldGroupId: groupId }, _max: { order: true } });
  return (_max.order ?? -1) + 1;
}

export async function createResultField(input: ResultFieldInput): Promise<{ errors?: ResultFieldErrors }> {
  await requireUserId();

  const errors = await prisma.$transaction(async (tx) => {
    const { data, errors } = await parseField(tx, input);
    if (!data) return errors;
    const { groupId, ...field } = data;
    await tx.resultField.create({
      data: { ...field, resultFieldGroupId: groupId, order: await nextOrder(tx, groupId) },
    });
  });
  if (errors) return { errors };
  refresh();
  return {};
}

// Updates the field. Moving it to another group of the same company puts it last there.
export async function updateResultField(
  input: ResultFieldInput & { fieldId: number },
): Promise<{ errors?: ResultFieldErrors }> {
  await requireUserId();
  const fieldId = idSchema.parse(input.fieldId);

  const errors = await prisma.$transaction(async (tx) => {
    const current = await tx.resultField.findUniqueOrThrow({
      where: { id: fieldId },
      select: { resultFieldGroupId: true, resultFieldGroup: { select: { companyId: true } } },
    });
    const { data, errors } = await parseField(tx, input, fieldId);
    if (!data) return errors;
    const { groupId, ...field } = data;

    const moved = groupId !== current.resultFieldGroupId;
    if (moved) {
      const group = await tx.resultFieldGroup.findUniqueOrThrow({ where: { id: groupId }, select: { companyId: true } });
      if (group.companyId !== current.resultFieldGroup.companyId) throw new Error("Group of another company");
    }
    await tx.resultField.update({
      where: { id: fieldId },
      data: { ...field, ...(moved && { resultFieldGroupId: groupId, order: await nextOrder(tx, groupId) }) },
    });
  });
  if (errors) return { errors };
  refresh();
  return {};
}

// Deletes the field with its estimates and valuation multiples if it has no results. Fields with
// results are kept, so result rows are never deleted.
export async function deleteResultField(input: { fieldId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();

  const { count } = await prisma.resultField.deleteMany({
    where: { id: idSchema.parse(input.fieldId), resultRows: { none: {} } },
  });
  refresh();
  return { deleted: count > 0 };
}

const reorderSchema = z.object({
  groupId: idSchema,
  fieldIds: z.array(idSchema),
});

// Orders the group's result fields as given. The ids must be exactly the group's fields.
export async function reorderResultFields(input: {
  groupId: number;
  fieldIds: number[];
}): Promise<{ saved: boolean }> {
  await requireUserId();

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { saved: false };
  const { groupId, fieldIds } = parsed.data;

  const saved = await prisma.$transaction(async (tx) => {
    const fields = await tx.resultField.findMany({ where: { resultFieldGroupId: groupId }, select: { id: true } });
    if (!isReordering(fieldIds, fields.map((field) => field.id))) return false;

    for (const [order, id] of fieldIds.entries())
      await tx.resultField.update({ where: { id }, data: { order } });
    return true;
  });
  if (saved) refresh();
  return { saved };
}
