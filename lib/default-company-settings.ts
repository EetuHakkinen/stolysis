// Settings every new company starts with, defined in default-company-settings.json: its estimate
// scenarios, and its result field groups and fields in display order, with the formulas of
// calculated fields. Formulas refer to
// fields by name, since the ids only exist once the company is created.

import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { EstimateType, FieldDefinitionKind, ResultFieldType, YearlyValue } from "../app/generated/prisma/enums.ts";
import settingsJson from "./default-company-settings.json" with { type: "json" };
import { checkFormula, formulaSchemaOf, hasCycle, type Formula } from "./formulas.ts";

const nameFormulaSchema = formulaSchemaOf(z.string().min(1));

const settingsSchema = z.strictObject({
  estimateScenarios: z.array(z.string().trim().min(1).max(100)),
  resultFieldGroups: z.array(
    z.strictObject({
      name: z.string().min(1),
      fields: z.array(
        z.strictObject({
          name: z.string().min(1),
          type: z.enum(ResultFieldType).optional(),
          yearlyValue: z.enum(YearlyValue).optional(),
          estimateType: z.enum(EstimateType).optional(),
          actualDefinition: nameFormulaSchema.optional(),
          estimateDefinition: nameFormulaSchema.optional(),
        }),
      ),
    }),
  ),
});

export type CompanySettings = z.infer<typeof settingsSchema>;

export const defaultCompanySettings: CompanySettings = settingsSchema.parse(settingsJson);

const DEFINITION_KEYS = {
  actual: "actualDefinition",
  estimate: "estimateDefinition",
} as const satisfies Record<FieldDefinitionKind, string>;

// What's wrong with the settings, beyond their shape: field names must be unique within the company
// as in the settings page, and formulas must be valid, refer to existing fields and not form loops.
export function settingsProblems(settings: CompanySettings): string[] {
  const fields = settings.resultFieldGroups.flatMap((group) => group.fields);
  const problems: string[] = [];

  // Scenario names are unique within the company, as in the database.
  const scenarioNames = new Set<string>();
  for (const name of settings.estimateScenarios) {
    if (scenarioNames.has(name)) problems.push(`Duplicate scenario name: ${name}`);
    scenarioNames.add(name);
  }

  const seen = new Set<string>();
  for (const { name } of fields) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) problems.push(`Duplicate field name: ${name}`);
    seen.add(key);
  }

  const names = new Set(fields.map((field) => field.name));
  for (const kind of Object.values(FieldDefinitionKind)) {
    const formulas = new Map<string, Formula<string>>();
    for (const field of fields) {
      const formula = field[DEFINITION_KEYS[kind]];
      if (!formula) continue;
      formulas.set(field.name, formula);
      const invalid = checkFormula(formula);
      if (invalid) problems.push(`Invalid ${kind} formula of ${field.name}: ${invalid.error} at ${invalid.index}`);
      for (const token of formula)
        if ("field" in token && !names.has(token.field))
          problems.push(`Unknown field in ${kind} formula of ${field.name}: ${token.field}`);
    }
    if (hasCycle(formulas)) problems.push(`The ${kind} formulas form a loop`);
  }
  return problems;
}

// Creates the company with the settings' estimate scenarios, result field groups, fields and
// formulas. Call inside a transaction, so a company is never left without its formulas.
export async function createCompanyWithSettings(
  tx: Prisma.TransactionClient,
  data: Omit<Prisma.CompanyCreateInput, "resultFieldGroups" | "estimateScenarios">,
  settings: CompanySettings = defaultCompanySettings,
): Promise<{ id: number }> {
  const company = await tx.company.create({
    data: {
      ...data,
      estimateScenarios: { create: settings.estimateScenarios.map((name) => ({ name })) },
      resultFieldGroups: {
        create: settings.resultFieldGroups.map((group, groupIndex) => ({
          name: group.name,
          order: groupIndex,
          resultFields: {
            create: group.fields.map(({ name, type, yearlyValue, estimateType }, fieldIndex) => ({
              name,
              type,
              yearlyValue,
              estimateType,
              order: fieldIndex,
            })),
          },
        })),
      },
    },
    select: { id: true, resultFieldGroups: { select: { resultFields: { select: { id: true, name: true } } } } },
  });

  const ids = new Map(
    company.resultFieldGroups.flatMap((group) => group.resultFields.map((field) => [field.name, field.id])),
  );
  const fieldId = (name: string) => {
    const id = ids.get(name);
    if (id == null) throw new Error(`Unknown field in default settings: ${name}`);
    return id;
  };

  const definitions = settings.resultFieldGroups
    .flatMap((group) => group.fields)
    .flatMap((field) =>
      Object.values(FieldDefinitionKind).flatMap((kind) => {
        const formula = field[DEFINITION_KEYS[kind]];
        if (!formula) return [];
        const definition: Formula = formula.map((token) =>
          "field" in token ? { field: fieldId(token.field), period: token.period } : token,
        );
        return [{ resultFieldId: fieldId(field.name), kind, definition }];
      }),
    );
  if (definitions.length > 0) await tx.fieldDefinition.createMany({ data: definitions });
  return { id: company.id };
}
