"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { EstimateType, FieldDefinitionKind, ResultFieldType, YearlyValue } from "@/app/generated/prisma/enums";
import { requireUserId } from "@/lib/auth";
import { checkFormula, formulaSchema, hasCycle, referencedFieldIds, type Formula, type FormulaError } from "@/lib/formulas";
import { isReordering } from "@/lib/ordering";
import { prisma } from "@/lib/prisma";

export type ResultFieldInput = {
  groupId: number;
  name: string;
  yearlyValue: YearlyValue;
  estimateType: EstimateType;
  type: ResultFieldType | null;
  // Formulas of a calculated field by FieldDefinitionKind; null when the values are entered.
  actualDefinition: Formula | null;
  estimateDefinition: Formula | null;
};

// Error values are translation keys under ResultFields.errors.
export type ResultFieldError =
  | "required"
  | "tooLong"
  | "nameTaken"
  | "typeTaken"
  | FormulaError
  | "unknownField"
  | "cycle";
export type ResultFieldErrors = Partial<
  Record<"name" | "type" | "actualDefinition" | "estimateDefinition", ResultFieldError>
>;

const DEFINITION_KEYS = {
  actual: "actualDefinition",
  estimate: "estimateDefinition",
} as const satisfies Record<FieldDefinitionKind, keyof ResultFieldErrors>;

const idSchema = z.number().int().positive();

const fieldSchema = z.object({
  groupId: idSchema,
  name: z.string().trim().min(1, "required").max(100, "tooLong"),
  yearlyValue: z.enum(YearlyValue),
  estimateType: z.enum(EstimateType),
  type: z.enum(ResultFieldType).nullable(),
  actualDefinition: formulaSchema.nullable(),
  estimateDefinition: formulaSchema.nullable(),
});

// Error in a formula of the field: invalid expression, a field that isn't the company's, or a loop
// with the company's other formulas of the same kind.
async function definitionError(
  tx: Prisma.TransactionClient,
  companyId: number,
  kind: FieldDefinitionKind,
  formula: Formula,
  fieldId: number | undefined,
): Promise<ResultFieldError | undefined> {
  const invalid = checkFormula(formula);
  if (invalid) return invalid.error;

  const ids = referencedFieldIds(formula);
  const known = await tx.resultField.count({ where: { id: { in: ids }, resultFieldGroup: { companyId } } });
  if (known !== ids.length) return "unknownField";

  // A new field can't be referenced by any formula yet, so it can't be part of a loop.
  if (fieldId == null) return undefined;
  const others = await tx.fieldDefinition.findMany({
    where: { kind, resultField: { resultFieldGroup: { companyId } }, resultFieldId: { not: fieldId } },
    select: { resultFieldId: true, definition: true },
  });
  const formulas = new Map<number, Formula>(
    others.map((other) => [other.resultFieldId, formulaSchema.parse(other.definition)]),
  );
  formulas.set(fieldId, formula);
  return hasCycle(formulas) ? "cycle" : undefined;
}

// Validates the input and checks that its group belongs to the company. Errors are returned for the
// name, the special type and the formulas; other invalid values can't come from the form, so they
// throw.
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
  // Formulas refer to fields by id, but users pick them by name.
  const nameTaken = await tx.resultField.count({
    where: {
      name: { equals: data.name, mode: "insensitive" },
      resultFieldGroup: { companyId: group.companyId },
      id: { not: fieldId },
    },
  });
  if (nameTaken > 0) return { errors: { name: "nameTaken" } };

  // Calculations rely on there being at most one field of each special type per company.
  if (data.type) {
    const taken = await tx.resultField.count({
      where: { type: data.type, resultFieldGroup: { companyId: group.companyId }, id: { not: fieldId } },
    });
    if (taken > 0) return { errors: { type: "typeTaken" } };
  }

  const errors: ResultFieldErrors = {};
  for (const kind of Object.values(FieldDefinitionKind)) {
    const key = DEFINITION_KEYS[kind];
    const formula = data[key];
    const error = formula && (await definitionError(tx, group.companyId, kind, formula, fieldId));
    if (error) errors[key] = error;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return { data };
}

// Saves the field's formulas, deleting those that are null so the values are entered again.
async function saveDefinitions(
  tx: Prisma.TransactionClient,
  fieldId: number,
  definitions: Record<(typeof DEFINITION_KEYS)[FieldDefinitionKind], Formula | null>,
) {
  for (const kind of Object.values(FieldDefinitionKind)) {
    const definition = definitions[DEFINITION_KEYS[kind]];
    if (definition)
      await tx.fieldDefinition.upsert({
        where: { resultFieldId_kind: { resultFieldId: fieldId, kind } },
        create: { resultFieldId: fieldId, kind, definition },
        update: { definition },
      });
    else await tx.fieldDefinition.deleteMany({ where: { resultFieldId: fieldId, kind } });
  }
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
    const { groupId, actualDefinition, estimateDefinition, ...field } = data;
    const { id } = await tx.resultField.create({
      data: { ...field, resultFieldGroupId: groupId, order: await nextOrder(tx, groupId) },
      select: { id: true },
    });
    await saveDefinitions(tx, id, { actualDefinition, estimateDefinition });
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
    const { groupId, actualDefinition, estimateDefinition, ...field } = data;

    const moved = groupId !== current.resultFieldGroupId;
    if (moved) {
      const group = await tx.resultFieldGroup.findUniqueOrThrow({ where: { id: groupId }, select: { companyId: true } });
      if (group.companyId !== current.resultFieldGroup.companyId) throw new Error("Group of another company");
    }
    await tx.resultField.update({
      where: { id: fieldId },
      data: { ...field, ...(moved && { resultFieldGroupId: groupId, order: await nextOrder(tx, groupId) }) },
    });
    await saveDefinitions(tx, fieldId, { actualDefinition, estimateDefinition });
  });
  if (errors) return { errors };
  refresh();
  return {};
}

// Deletes the field with its estimates, formulas and valuation multiples if it has no results and
// no other field's formula uses it. Fields with results are kept, so result rows are never deleted.
export async function deleteResultField(input: { fieldId: number }): Promise<{ deleted: boolean }> {
  await requireUserId();
  const fieldId = idSchema.parse(input.fieldId);

  const deleted = await prisma.$transaction(async (tx) => {
    const usedBy = await tx.fieldDefinition.count({
      where: { resultFieldId: { not: fieldId }, definition: { array_contains: [{ field: fieldId }] } },
    });
    if (usedBy > 0) return false;
    const { count } = await tx.resultField.deleteMany({ where: { id: fieldId, resultRows: { none: {} } } });
    return count > 0;
  });
  refresh();
  return { deleted };
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
