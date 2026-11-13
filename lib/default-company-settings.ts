// Settings every new company starts with, defined in default-company-settings.json: its estimate
// scenarios, its result field groups and fields in display order, with the formulas of calculated
// fields, and its graphs. Formulas and graphs refer to fields by name, since the ids only exist
// once the company is created.

import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  EstimateType,
  FieldDefinitionKind,
  GraphAxis,
  GraphFieldType,
  ResultFieldType,
  ValueFormat,
  YearlyValue,
} from "../app/generated/prisma/enums.ts";
import settingsJson from "./default-company-settings.json" with { type: "json" };
import { checkFormula, formulaSchema, formulaSchemaOf, hasCycle, type Formula } from "./formulas.ts";
import { mergeDefaults } from "./ordering.ts";

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
          valueFormat: z.enum(ValueFormat).optional(),
          estimateType: z.enum(EstimateType).optional(),
          starred: z.boolean().optional(),
          actualDefinition: nameFormulaSchema.optional(),
          estimateDefinition: nameFormulaSchema.optional(),
        }),
      ),
    }),
  ),
  graphs: z.array(
    z.strictObject({
      name: z.string().trim().min(1).max(100),
      starred: z.boolean().optional(),
      fields: z.array(
        z.strictObject({
          field: z.string().min(1),
          type: z.enum(GraphFieldType).optional(),
          axis: z.enum(GraphAxis).optional(),
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

const nameKey = (name: string | null) => (name ?? "").trim().toLowerCase();

// What's wrong with the settings, beyond their shape: field names must be unique within the company
// as in the settings page, formulas must be valid, refer to existing fields and not form loops, and
// graph names must be unique and their fields exist, each at most once per graph.
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

  const graphNames = new Set<string>();
  for (const graph of settings.graphs) {
    const key = nameKey(graph.name);
    if (graphNames.has(key)) problems.push(`Duplicate graph name: ${graph.name}`);
    graphNames.add(key);
    const graphFields = new Set<string>();
    for (const { field } of graph.fields) {
      if (!names.has(field)) problems.push(`Unknown field in graph ${graph.name}: ${field}`);
      if (graphFields.has(field)) problems.push(`Duplicate field in graph ${graph.name}: ${field}`);
      graphFields.add(field);
    }
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
  const company = await tx.company.create({ data, select: { id: true } });
  await applySettings(tx, company.id, settings);
  return company;
}

// How many of each part of the settings were added to a company, and how many existing fields got
// their special type. Skipped formulas would have formed a loop with the company's other formulas.
export type AppliedSettings = {
  scenarios: number;
  groups: number;
  fields: number;
  types: number;
  formulas: number;
  graphs: number;
  skippedFormulas: number;
};

// Adds the parts of the settings the company doesn't have yet, matched by name ignoring case:
// estimate scenarios, result field groups, result fields, formulas of fields that have no formula
// of that kind, and graphs (with their fields, after the company's own graphs). Existing ones are otherwise left as they are, also fields that are in
// another group than in the settings. Added groups and fields go right after the closest preceding
// ones of the settings that the company has. An existing field without a special type gets the one
// of the settings. A field doesn't get a special type another field already has. Call inside a
// transaction.
export async function applySettings(
  tx: Prisma.TransactionClient,
  companyId: number,
  settings: CompanySettings = defaultCompanySettings,
): Promise<AppliedSettings> {
  const applied: AppliedSettings = {
    scenarios: 0,
    groups: 0,
    fields: 0,
    types: 0,
    formulas: 0,
    graphs: 0,
    skippedFormulas: 0,
  };

  const scenarios = await tx.estimateScenario.findMany({ where: { companyId }, select: { name: true } });
  const scenarioNames = new Set(scenarios.map((scenario) => nameKey(scenario.name)));
  const newScenarios = settings.estimateScenarios.filter((name) => !scenarioNames.has(nameKey(name)));
  if (newScenarios.length > 0) {
    await tx.estimateScenario.createMany({ data: newScenarios.map((name) => ({ companyId, name })) });
    applied.scenarios = newScenarios.length;
  }

  const groups = await tx.resultFieldGroup.findMany({
    where: { companyId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      order: true,
      resultFields: {
        orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, name: true, order: true, type: true, fieldDefinitions: { select: { kind: true, definition: true } } },
      },
    },
  });
  type ExistingField = (typeof groups)[number]["resultFields"][number];
  const existingFields = groups.flatMap((group) => group.resultFields);
  // Field names are unique within the company, as in the settings page.
  const fieldIds = new Map(existingFields.map((field) => [nameKey(field.name), field.id]));
  const takenTypes = new Set(existingFields.flatMap((field) => (field.type ? [field.type] : [])));

  const targets = new Map<CompanySettings["resultFieldGroups"][number], { id: number; fields: ExistingField[] }>();
  const mergedGroups = mergeDefaults(groups, settings.resultFieldGroups, (group) =>
    groups.find((existing) => nameKey(existing.name) === nameKey(group.name)),
  );
  for (const [order, entry] of mergedGroups.entries()) {
    if ("existing" in entry) {
      if (entry.existing.order !== order)
        await tx.resultFieldGroup.update({ where: { id: entry.existing.id }, data: { order } });
      continue;
    }
    const { id } = await tx.resultFieldGroup.create({
      data: { companyId, name: entry.added.name, order },
      select: { id: true },
    });
    targets.set(entry.added, { id, fields: [] });
    applied.groups++;
  }
  for (const group of settings.resultFieldGroups) {
    if (targets.has(group)) continue;
    const existing = groups.find((candidate) => nameKey(candidate.name) === nameKey(group.name));
    if (existing) targets.set(group, { id: existing.id, fields: existing.resultFields });
  }

  for (const group of settings.resultFieldGroups) {
    const target = targets.get(group);
    if (!target) throw new Error(`Group missing after applying settings: ${group.name}`);
    const inGroup = (name: string) => target.fields.find((field) => nameKey(field.name) === nameKey(name));
    // Fields the company has in another group stay there.
    const fields = group.fields.filter((field) => inGroup(field.name) || !fieldIds.has(nameKey(field.name)));
    const merged = mergeDefaults(target.fields, fields, (field) => inGroup(field.name));
    for (const [order, entry] of merged.entries()) {
      if ("existing" in entry) {
        if (entry.existing.order !== order) await tx.resultField.update({ where: { id: entry.existing.id }, data: { order } });
        continue;
      }
      const { name, type, yearlyValue, valueFormat, estimateType, starred } = entry.added;
      const freeType = type && !takenTypes.has(type) ? type : undefined;
      if (freeType) takenTypes.add(freeType);
      const { id } = await tx.resultField.create({
        data: { resultFieldGroupId: target.id, name, type: freeType, yearlyValue, valueFormat, estimateType, starred, order },
        select: { id: true },
      });
      fieldIds.set(nameKey(name), id);
      applied.fields++;
    }
  }

  for (const { name, type } of settings.resultFieldGroups.flatMap((group) => group.fields)) {
    const existing = existingFields.find((field) => nameKey(field.name) === nameKey(name));
    if (!type || !existing || existing.type || takenTypes.has(type)) continue;
    await tx.resultField.update({ where: { id: existing.id }, data: { type } });
    takenTypes.add(type);
    applied.types++;
  }

  const fieldId = (name: string) => {
    const id = fieldIds.get(nameKey(name));
    if (id == null) throw new Error(`Unknown field in settings: ${name}`);
    return id;
  };
  for (const kind of Object.values(FieldDefinitionKind)) {
    const formulas = new Map(
      existingFields.flatMap((field) =>
        field.fieldDefinitions
          .filter((definition) => definition.kind === kind)
          .map((definition) => [field.id, formulaSchema.parse(definition.definition)] as const),
      ),
    );
    for (const field of settings.resultFieldGroups.flatMap((group) => group.fields)) {
      const formula = field[DEFINITION_KEYS[kind]];
      const id = fieldId(field.name);
      if (!formula || formulas.has(id)) continue;
      const definition: Formula = formula.map((token) =>
        "field" in token ? { field: fieldId(token.field), period: token.period } : token,
      );
      formulas.set(id, definition);
      if (hasCycle(formulas)) {
        formulas.delete(id);
        applied.skippedFormulas++;
        continue;
      }
      await tx.fieldDefinition.create({ data: { resultFieldId: id, kind, definition } });
      applied.formulas++;
    }
  }

  const graphs = await tx.graph.findMany({ where: { companyId }, select: { name: true, order: true } });
  const graphNames = new Set(graphs.map((graph) => nameKey(graph.name)));
  let graphOrder = Math.max(-1, ...graphs.map((graph) => graph.order ?? -1)) + 1;
  for (const graph of settings.graphs) {
    if (graphNames.has(nameKey(graph.name))) continue;
    await tx.graph.create({
      data: {
        companyId,
        name: graph.name,
        starred: graph.starred,
        order: graphOrder++,
        fields: {
          create: graph.fields.map(({ field, type, axis }, order) => ({
            resultFieldId: fieldId(field),
            type,
            axis,
            order,
          })),
        },
      },
    });
    applied.graphs++;
  }
  return applied;
}
