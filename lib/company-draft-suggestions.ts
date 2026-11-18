// Applying the field change suggestions of the report check to the draft of a company being
// created. Suggestions refer to the draft's fields by the ids they had when the check started, and
// may have been made stale by editing the draft since; applying one checks it against the draft as
// it is now. Pure, so it runs on the client as well as on the server.

import type { ResultFieldInput } from "@/actions/result-fields";
import {
  addDraftField,
  draftFieldErrors,
  reorderDraftFields,
  updateDraftField,
  type CompanyDraftSettings,
  type DraftField,
  type DraftGroup,
} from "./company-draft.ts";
import { referencedFieldIds, type Formula } from "./formulas.ts";
import type { FieldSuggestion, SuggestedChange, SuggestionFieldRef } from "./report-check-api.ts";

// Draft field ids of the fields added by applied suggestions, by their keys.
export type NewFieldIds = Record<string, number>;

// stale: a field the suggestion changes isn't in the draft any more, or a new field it uses wasn't
// added. invalid: the change isn't valid in the draft, e.g. a name is taken or a formula would form
// a loop. stillUsed: a deleted field would still be used by the formulas of fieldIds.
export type SuggestionResult =
  | { ok: true; draft: CompanyDraftSettings; newFieldIds: NewFieldIds }
  | { ok: false; reason: "stale" | "invalid" }
  | { ok: false; reason: "stillUsed"; fieldIds: number[] };

type Edit = Exclude<SuggestedChange, { action: "delete" }>;

function findField(draft: CompanyDraftSettings, fieldId: number): { group: DraftGroup; field: DraftField } | undefined {
  for (const group of draft.groups) {
    const field = group.fields.find((candidate) => candidate.id === fieldId);
    if (field) return { group, field };
  }
  return undefined;
}

const inputOf = (group: DraftGroup, field: DraftField, values: Partial<ResultFieldInput>): ResultFieldInput => ({
  groupId: group.id,
  name: field.name,
  type: field.type,
  yearlyValue: field.yearlyValue,
  valueFormat: field.valueFormat,
  estimateType: field.estimateType,
  actualDefinition: field.actualDefinition,
  estimateDefinition: field.estimateDefinition,
  ...values,
});

// The formula with the new fields' keys replaced with their ids; undefined when one is missing.
function resolveFormula(formula: Formula<SuggestionFieldRef>, newFieldIds: NewFieldIds): Formula | undefined {
  const resolved: Formula = [];
  for (const token of formula) {
    if (!("field" in token)) resolved.push(token);
    else if (typeof token.field === "number") resolved.push({ ...token, field: token.field });
    else if (newFieldIds[token.field] != null) resolved.push({ ...token, field: newFieldIds[token.field] });
    else return undefined;
  }
  return resolved;
}

function applyEdit(
  draft: CompanyDraftSettings,
  edit: Edit,
  newFieldIds: NewFieldIds,
): CompanyDraftSettings | "stale" | "invalid" {
  const found = findField(draft, edit.fieldId);
  if (!found) return "stale";
  let values: Partial<ResultFieldInput>;
  if (edit.action === "rename") {
    values = { name: edit.name };
  } else {
    const formula = edit.formula && resolveFormula(edit.formula, newFieldIds);
    if (formula === undefined) return "stale";
    values = edit.kind === "actual" ? { actualDefinition: formula } : { estimateDefinition: formula };
  }
  const input = inputOf(found.group, found.field, values);
  if (draftFieldErrors(draft, input, edit.fieldId)) return "invalid";
  return updateDraftField(draft, edit.fieldId, input);
}

// Edits the fields, then deletes the fields of deleteIds and those the changes delete, if no
// formula left uses them.
function applyChanges(
  draft: CompanyDraftSettings,
  deleteIds: number[],
  changes: SuggestedChange[],
  newFieldIds: NewFieldIds,
): SuggestionResult {
  const deleted = new Set(deleteIds);
  let next = draft;
  for (const change of changes) {
    if (change.action === "delete") {
      const found = findField(next, change.fieldId);
      if (!found) return { ok: false, reason: "stale" };
      if (found.field.type) return { ok: false, reason: "invalid" };
      deleted.add(change.fieldId);
      continue;
    }
    const edited = applyEdit(next, change, newFieldIds);
    if (typeof edited === "string") return { ok: false, reason: edited };
    next = edited;
  }

  next = {
    ...next,
    groups: next.groups.map((group) => ({ ...group, fields: group.fields.filter((field) => !deleted.has(field.id)) })),
  };
  const users = next.groups
    .flatMap((group) => group.fields)
    .filter((field) =>
      [field.actualDefinition, field.estimateDefinition].some((formula) =>
        formula ? referencedFieldIds(formula).some((id) => deleted.has(id)) : false,
      ),
    );
  if (users.length > 0) return { ok: false, reason: "stillUsed", fieldIds: users.map((field) => field.id) };
  return { ok: true, draft: next, newFieldIds };
}

// Applies the suggestion: renames its field, or adds its new fields in the field's place and
// deletes the field. With a deletion, the changes of changeIds are applied with it, since the
// formulas using the field have to change first; a rename's changes are applied after it, one by
// one, with applySuggestedChange.
export function applyFieldSuggestion(
  draft: CompanyDraftSettings,
  suggestion: FieldSuggestion,
  changeIds: string[] = [],
): SuggestionResult {
  const found = findField(draft, suggestion.fieldId);
  if (!found) return { ok: false, reason: "stale" };
  const { group, field } = found;

  if (suggestion.action === "rename") {
    const input = inputOf(group, field, { name: suggestion.name });
    if (draftFieldErrors(draft, input, field.id)) return { ok: false, reason: "invalid" };
    return { ok: true, draft: updateDraftField(draft, field.id, input), newFieldIds: {} };
  }

  if (field.type) return { ok: false, reason: "invalid" };
  let next = draft;
  const newFieldIds: NewFieldIds = {};
  const order = group.fields.map((candidate) => candidate.id);
  let at = order.indexOf(field.id) + 1;
  for (const newField of suggestion.newFields) {
    const input: ResultFieldInput = {
      groupId: group.id,
      name: newField.name,
      type: null,
      yearlyValue: newField.yearlyValue,
      valueFormat: newField.valueFormat,
      estimateType: "relative",
      actualDefinition: null,
      estimateDefinition: null,
    };
    if (draftFieldErrors(next, input)) return { ok: false, reason: "invalid" };
    next = addDraftField(next, input);
    const id = findField(next, field.id)!.group.fields.at(-1)!.id;
    newFieldIds[newField.key] = id;
    order.splice(at++, 0, id);
  }
  next = reorderDraftFields(next, group.id, order);
  const changes = suggestion.changes.filter((change) => changeIds.includes(change.id));
  return applyChanges(next, [field.id], changes, newFieldIds);
}

// Applies one change of an applied suggestion, using the fields added by applied suggestions.
export function applySuggestedChange(
  draft: CompanyDraftSettings,
  change: SuggestedChange,
  newFieldIds: NewFieldIds,
): SuggestionResult {
  const result = applyChanges(draft, [], [change], newFieldIds);
  return result.ok ? { ...result, newFieldIds: {} } : result;
}
