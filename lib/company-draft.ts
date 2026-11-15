// A new company's result field groups and fields while they are reviewed before the company is
// created. As in the settings page, groups and fields have ids, and formulas and graphs refer to
// fields by id, so a field can be renamed without breaking them. The ids only live in the draft:
// creating the company turns it back into settings that refer to fields by name. Pure, so it runs
// on the client as well as on the server.

import type { ResultFieldGroupSettingsData } from "@/actions/result-field-groups";
import type { ResultFieldErrors, ResultFieldInput } from "@/actions/result-fields";
import type { EstimateType, ResultFieldType, ValueFormat, YearlyValue } from "../app/generated/prisma/enums.ts";
import {
  defaultCompanySettings,
  settingsWithReporting,
  type CompanySettings,
  type StatementReporting,
} from "./default-company-settings.ts";
import type { ReportingCycle } from "./financial-year.ts";
import { checkFormula, formulaUsers, hasCycle, referencedFieldIds, type Formula } from "./formulas.ts";
import { isReordering } from "./ordering.ts";
import type { RevenueBreakdown } from "./report-check-api.ts";

export type DraftField = {
  id: number;
  name: string;
  type: ResultFieldType | null;
  yearlyValue: YearlyValue;
  valueFormat: ValueFormat;
  estimateType: EstimateType;
  starred: boolean;
  actualDefinition: Formula | null;
  estimateDefinition: Formula | null;
};

export type DraftGroup = { id: number; name: string; fields: DraftField[] };

type DraftGraph = Omit<CompanySettings["graphs"][number], "fields"> & {
  fields: (Omit<CompanySettings["graphs"][number]["fields"][number], "field"> & { field: number })[];
};

export type CompanyDraftSettings = {
  estimateScenarios: string[];
  groups: DraftGroup[];
  graphs: DraftGraph[];
};

// Same limit as for the names of groups and fields in the settings page.
const MAX_NAME_LENGTH = 100;

const nameKey = (name: string) => name.trim().toLowerCase();

// The draft of the settings, with ids in the order of the groups and fields. Values the settings
// leave out get the database defaults.
export function draftFromSettings(settings: CompanySettings): CompanyDraftSettings {
  const ids = new Map(
    settings.resultFieldGroups.flatMap((group) => group.fields).map((field, index) => [field.name, index + 1]),
  );
  const fieldId = (name: string) => {
    const id = ids.get(name);
    if (id == null) throw new Error(`Unknown field in settings: ${name}`);
    return id;
  };
  const withIds = (formula: Formula<string> | undefined): Formula | null =>
    formula ? formula.map((token) => ("field" in token ? { ...token, field: fieldId(token.field) } : token)) : null;

  return {
    estimateScenarios: settings.estimateScenarios,
    groups: settings.resultFieldGroups.map((group, index) => ({
      id: index + 1,
      name: group.name,
      fields: group.fields.map((field) => ({
        id: fieldId(field.name),
        name: field.name,
        type: field.type ?? null,
        yearlyValue: field.yearlyValue ?? "sum",
        valueFormat: field.valueFormat ?? "money",
        estimateType: field.estimateType ?? "relative",
        starred: field.starred ?? false,
        actualDefinition: withIds(field.actualDefinition),
        estimateDefinition: withIds(field.estimateDefinition),
      })),
    })),
    graphs: settings.graphs.map((graph) => ({
      ...graph,
      fields: graph.fields.map((field) => ({ ...field, field: fieldId(field.field) })),
    })),
  };
}

// The settings to create the company with. Graphs leave out the fields deleted from the draft, and
// graphs left without fields are left out.
export function settingsFromDraft(draft: CompanyDraftSettings): CompanySettings {
  const names = new Map(draft.groups.flatMap((group) => group.fields).map((field) => [field.id, field.name]));
  const fieldName = (id: number) => {
    const name = names.get(id);
    if (name == null) throw new Error(`Unknown field in draft: ${id}`);
    return name;
  };
  const withNames = (formula: Formula | null): Formula<string> | undefined =>
    formula?.map((token) => ("field" in token ? { ...token, field: fieldName(token.field) } : token));

  return {
    estimateScenarios: draft.estimateScenarios,
    resultFieldGroups: draft.groups.map((group) => ({
      name: group.name,
      fields: group.fields.map((field) => ({
        name: field.name,
        ...(field.type && { type: field.type }),
        yearlyValue: field.yearlyValue,
        valueFormat: field.valueFormat,
        estimateType: field.estimateType,
        starred: field.starred,
        ...(field.actualDefinition && { actualDefinition: withNames(field.actualDefinition) }),
        ...(field.estimateDefinition && { estimateDefinition: withNames(field.estimateDefinition) }),
      })),
    })),
    graphs: draft.graphs.flatMap((graph) => {
      const fields = graph.fields.filter((field) => names.has(field.field));
      return fields.length === 0
        ? []
        : [{ ...graph, fields: fields.map((field) => ({ ...field, field: fieldName(field.field) })) }];
    }),
  };
}

// The draft a company starts with: the default settings with the statements it reports in full only
// yearly applied. With a yearly reporting cycle, every season is a whole year, so the statements'
// reporting doesn't matter and the defaults are used as they are.
export function initialDraft(reportingCycle: ReportingCycle, reporting: StatementReporting): CompanyDraftSettings {
  return draftFromSettings(
    reportingCycle === "yearly" ? defaultCompanySettings : settingsWithReporting(defaultCompanySettings, reporting),
  );
}

// Whether the reporting choices give the same initial draft.
export function sameReportingChoices(
  a: { reportingCycle: ReportingCycle; reporting: StatementReporting },
  b: { reportingCycle: ReportingCycle; reporting: StatementReporting },
): boolean {
  if (a.reportingCycle !== b.reportingCycle) return false;
  if (a.reportingCycle === "yearly") return true;
  return (Object.keys(a.reporting) as (keyof StatementReporting)[]).every(
    (statement) => a.reporting[statement] === b.reporting[statement],
  );
}

// The draft's groups as the result field tables show them. The company has no results yet, and
// fields used by another field's formula can't be deleted.
export function draftGroupsData(draft: CompanyDraftSettings): ResultFieldGroupSettingsData[] {
  const usedBy = draftFormulaUsers(draft);
  return draft.groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => ({ ...field, hasResults: false, usedBy: usedBy.get(field.id) ?? [] })),
  }));
}

// Ids of the other fields whose formulas use each field of the draft.
export function draftFormulaUsers(draft: CompanyDraftSettings): Map<number, number[]> {
  return formulaUsers(draft.groups.flatMap((group) => group.fields));
}

// The same errors as saving the field in the settings page gives: a missing, too long or taken
// name, a taken special type, and an invalid formula, one using a field not in the draft or one
// forming a loop with the other formulas of its kind. fieldId is the edited field; undefined when
// creating one.
export function draftFieldErrors(
  draft: CompanyDraftSettings,
  input: ResultFieldInput,
  fieldId?: number,
): ResultFieldErrors | undefined {
  const others = draft.groups.flatMap((group) => group.fields).filter((field) => field.id !== fieldId);
  const name = input.name.trim();
  if (name === "") return { name: "required" };
  if (name.length > MAX_NAME_LENGTH) return { name: "tooLong" };
  if (others.some((field) => nameKey(field.name) === nameKey(name))) return { name: "nameTaken" };
  if (input.type && others.some((field) => field.type === input.type)) return { type: "typeTaken" };

  const ids = new Set([...others.map((field) => field.id), ...(fieldId == null ? [] : [fieldId])]);
  const errors: ResultFieldErrors = {};
  for (const key of ["actualDefinition", "estimateDefinition"] as const) {
    const formula = input[key];
    if (!formula) continue;
    const invalid = checkFormula(formula);
    if (invalid) {
      errors[key] = invalid.error;
      continue;
    }
    if (referencedFieldIds(formula).some((id) => !ids.has(id))) {
      errors[key] = "unknownField";
      continue;
    }
    // A new field can't be referenced by any formula yet, so it can't be part of a loop.
    if (fieldId == null) continue;
    const formulas = new Map(others.flatMap((field) => (field[key] ? [[field.id, field[key]] as const] : [])));
    formulas.set(fieldId, formula);
    if (hasCycle(formulas)) errors[key] = "cycle";
  }
  return Object.keys(errors).length > 0 ? errors : undefined;
}

// A missing or too long group name, as in the settings page.
export function draftGroupNameError(name: string): "required" | "tooLong" | undefined {
  const trimmed = name.trim();
  if (trimmed === "") return "required";
  if (trimmed.length > MAX_NAME_LENGTH) return "tooLong";
  return undefined;
}

const nextId = (items: { id: number }[]) => Math.max(0, ...items.map((item) => item.id)) + 1;

const mapGroups = (draft: CompanyDraftSettings, map: (group: DraftGroup) => DraftGroup): CompanyDraftSettings => ({
  ...draft,
  groups: draft.groups.map(map),
});

// Adds the field last in its group. Validate it with draftFieldErrors first.
export function addDraftField(draft: CompanyDraftSettings, input: ResultFieldInput): CompanyDraftSettings {
  const { groupId, ...values } = input;
  const field: DraftField = {
    ...values,
    name: values.name.trim(),
    id: nextId(draft.groups.flatMap((group) => group.fields)),
    starred: false,
  };
  return mapGroups(draft, (group) => (group.id === groupId ? { ...group, fields: [...group.fields, field] } : group));
}

// Updates the field. Moving it to another group puts it last there. Validate it with
// draftFieldErrors first.
export function updateDraftField(
  draft: CompanyDraftSettings,
  fieldId: number,
  input: ResultFieldInput,
): CompanyDraftSettings {
  const { groupId, ...values } = input;
  const current = draft.groups.flatMap((group) => group.fields).find((field) => field.id === fieldId);
  if (!current) return draft;
  const field: DraftField = { ...current, ...values, name: values.name.trim() };
  return mapGroups(draft, (group) => {
    const index = group.fields.findIndex((candidate) => candidate.id === fieldId);
    if (index >= 0)
      return group.id === groupId
        ? { ...group, fields: group.fields.with(index, field) }
        : { ...group, fields: group.fields.filter((candidate) => candidate.id !== fieldId) };
    return group.id === groupId ? { ...group, fields: [...group.fields, field] } : group;
  });
}

// Deletes the field unless another field's formula uses it.
export function deleteDraftField(draft: CompanyDraftSettings, fieldId: number): CompanyDraftSettings {
  if ((draftFormulaUsers(draft).get(fieldId) ?? []).length > 0) return draft;
  return mapGroups(draft, (group) => ({ ...group, fields: group.fields.filter((field) => field.id !== fieldId) }));
}

export function setDraftFieldStarred(
  draft: CompanyDraftSettings,
  fieldId: number,
  starred: boolean,
): CompanyDraftSettings {
  return mapGroups(draft, (group) => ({
    ...group,
    fields: group.fields.map((field) => (field.id === fieldId ? { ...field, starred } : field)),
  }));
}

// Orders the given ids as given, if they are exactly the ids of the items.
function reordered<T extends { id: number }>(items: T[], ids: number[]): T[] {
  if (
    !isReordering(
      ids,
      items.map((item) => item.id),
    )
  )
    return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)!);
}

export function reorderDraftFields(
  draft: CompanyDraftSettings,
  groupId: number,
  fieldIds: number[],
): CompanyDraftSettings {
  return mapGroups(draft, (group) =>
    group.id === groupId ? { ...group, fields: reordered(group.fields, fieldIds) } : group,
  );
}

// Adds the group last. Validate its name with draftGroupNameError first.
export function addDraftGroup(draft: CompanyDraftSettings, name: string): CompanyDraftSettings {
  return { ...draft, groups: [...draft.groups, { id: nextId(draft.groups), name: name.trim(), fields: [] }] };
}

// Validate the name with draftGroupNameError first.
export function renameDraftGroup(draft: CompanyDraftSettings, groupId: number, name: string): CompanyDraftSettings {
  return mapGroups(draft, (group) => (group.id === groupId ? { ...group, name: name.trim() } : group));
}

// Deletes the group if it has no fields.
export function deleteDraftGroup(draft: CompanyDraftSettings, groupId: number): CompanyDraftSettings {
  return { ...draft, groups: draft.groups.filter((group) => group.id !== groupId || group.fields.length > 0) };
}

export function reorderDraftGroups(draft: CompanyDraftSettings, groupIds: number[]): CompanyDraftSettings {
  return { ...draft, groups: reordered(draft.groups, groupIds) };
}

// The group of a revenue breakdown in the draft, matched by name ignoring case.
export function breakdownGroup(draft: CompanyDraftSettings, breakdown: RevenueBreakdown): DraftGroup | undefined {
  return draft.groups.find((group) => nameKey(group.name) === nameKey(breakdown.name));
}

const revenueField = (draft: CompanyDraftSettings) =>
  draft.groups.flatMap((group) => group.fields).find((field) => field.type === "revenue");

// A formula summing the fields in the same period.
function sumFormula(fieldIds: number[]): Formula {
  return fieldIds.flatMap((field, index) => [
    ...(index > 0 ? [{ operator: "+" as const }] : []),
    { field, period: "current" as const },
  ]);
}

// Adds the revenue breakdown as a group of its own, right before the group of the revenue field (or
// first without one), with a field for each category entered and estimated like revenue. A
// category's name that another field already has gets the breakdown's name after it, e.g. "Muut
// (Liikevaihto tuotteittain)". When the revenue field has no estimate formula yet, its estimate
// becomes the sum of the categories. A breakdown the draft already has isn't added again.
export function addRevenueBreakdown(draft: CompanyDraftSettings, breakdown: RevenueBreakdown): CompanyDraftSettings {
  if (breakdownGroup(draft, breakdown) || breakdown.categories.length === 0) return draft;

  const taken = new Set(draft.groups.flatMap((group) => group.fields).map((field) => nameKey(field.name)));
  const uniqueName = (category: string) => {
    let name = taken.has(nameKey(category)) ? `${category} (${breakdown.name})` : category;
    for (let n = 2; taken.has(nameKey(name)); n++) name = `${category} (${breakdown.name} ${n})`;
    taken.add(nameKey(name));
    return name.slice(0, MAX_NAME_LENGTH);
  };
  const firstId = nextId(draft.groups.flatMap((group) => group.fields));
  const group: DraftGroup = {
    id: nextId(draft.groups),
    name: breakdown.name.slice(0, MAX_NAME_LENGTH),
    fields: breakdown.categories.map((category, index) => ({
      id: firstId + index,
      name: uniqueName(category),
      type: null,
      yearlyValue: "sum",
      valueFormat: "money",
      estimateType: "relative",
      starred: false,
      actualDefinition: null,
      estimateDefinition: null,
    })),
  };

  const revenue = revenueField(draft);
  const revenueGroup = draft.groups.findIndex((candidate) => candidate.fields.some((field) => field === revenue));
  const at = Math.max(revenueGroup, 0);
  const added = { ...draft, groups: [...draft.groups.slice(0, at), group, ...draft.groups.slice(at)] };
  return revenue && !revenue.estimateDefinition ? setRevenueEstimateGroup(added, group.id) : added;
}

// The group whose fields' sum is the revenue field's estimate formula, if any.
export function revenueEstimateGroupId(draft: CompanyDraftSettings): number | undefined {
  const formula = revenueField(draft)?.estimateDefinition;
  if (!formula) return undefined;
  const key = JSON.stringify(formula);
  return draft.groups.find(
    (group) => group.fields.length > 0 && JSON.stringify(sumFormula(group.fields.map((field) => field.id))) === key,
  )?.id;
}

// Makes the revenue field's estimate the sum of the group's fields.
export function setRevenueEstimateGroup(draft: CompanyDraftSettings, groupId: number): CompanyDraftSettings {
  const group = draft.groups.find((candidate) => candidate.id === groupId);
  const revenue = revenueField(draft);
  if (!group || group.fields.length === 0 || !revenue) return draft;
  const estimateDefinition = sumFormula(group.fields.map((field) => field.id));
  return mapGroups(draft, (candidate) => ({
    ...candidate,
    fields: candidate.fields.map((field) => (field.id === revenue.id ? { ...field, estimateDefinition } : field)),
  }));
}
