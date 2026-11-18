import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { draftFromSettings, type CompanyDraftSettings } from "./company-draft.ts";
import { applyFieldSuggestion, applySuggestedChange } from "./company-draft-suggestions.ts";
import type { FieldSuggestion, SuggestedChange } from "./report-check-api.ts";

const field = (name: string) => ({ field: name, period: "current" as const });
// 1 Liikevaihto, 2 Henkilöstökulut, 3 Muut kulut, 4 Liikevoitto, 5 Henkilöstökulujen kasvu-%
const draft = draftFromSettings({
  estimateScenarios: [],
  resultFieldGroups: [
    {
      name: "Tuloslaskelma",
      fields: [
        { name: "Liikevaihto", type: "revenue" },
        { name: "Henkilöstökulut" },
        { name: "Muut kulut" },
        {
          name: "Liikevoitto",
          estimateDefinition: [
            field("Liikevaihto"),
            { operator: "+" },
            field("Henkilöstökulut"),
            { operator: "+" },
            field("Muut kulut"),
          ],
        },
        {
          name: "Henkilöstökulujen kasvu-%",
          valueFormat: "percent",
          actualDefinition: [
            field("Henkilöstökulut"),
            { operator: "/" },
            { field: "Henkilöstökulut", period: "previous" },
          ],
        },
      ],
    },
  ],
  graphs: [],
});

const names = (draft: CompanyDraftSettings) => draft.groups[0].fields.map((field) => field.name);
const cur = (field: number | string) => ({ field, period: "current" as const });

const replaceExpenses: FieldSuggestion = {
  id: "s1",
  fieldId: 2,
  fieldName: "Henkilöstökulut",
  reason: "",
  action: "delete",
  newFields: [{ key: "new_1", name: "Liiketoiminnan kulut", yearlyValue: "sum", valueFormat: "money" }],
  changes: [
    {
      id: "s1.1",
      fieldId: 4,
      fieldName: "Liikevoitto",
      action: "formula",
      kind: "estimate",
      formula: [cur(1), { operator: "+" }, cur("new_1"), { operator: "+" }, cur(3)],
    },
    { id: "s1.2", fieldId: 5, fieldName: "Henkilöstökulujen kasvu-%", action: "delete" },
  ],
};

describe("applyFieldSuggestion", () => {
  it("renames the field", () => {
    const result = applyFieldSuggestion(draft, {
      id: "s1",
      fieldId: 3,
      fieldName: "Muut kulut",
      reason: "",
      action: "rename",
      name: "Liiketoiminnan muut kulut",
      changes: [],
    });
    assert.ok(result.ok);
    assert.deepEqual(names(result.draft), [
      "Liikevaihto",
      "Henkilöstökulut",
      "Liiketoiminnan muut kulut",
      "Liikevoitto",
      "Henkilöstökulujen kasvu-%",
    ]);
  });

  it("doesn't rename to a taken name", () => {
    const result = applyFieldSuggestion(draft, {
      id: "s1",
      fieldId: 3,
      fieldName: "Muut kulut",
      reason: "",
      action: "rename",
      name: "liikevaihto",
      changes: [],
    });
    assert.deepEqual(result, { ok: false, reason: "invalid" });
  });

  it("replaces the field with new fields and changes the formulas using it", () => {
    const result = applyFieldSuggestion(draft, replaceExpenses, ["s1.1", "s1.2"]);
    assert.ok(result.ok);
    assert.deepEqual(result.newFieldIds, { new_1: 6 });
    assert.deepEqual(names(result.draft), ["Liikevaihto", "Liiketoiminnan kulut", "Muut kulut", "Liikevoitto"]);
    assert.deepEqual(result.draft.groups[0].fields[3].estimateDefinition, [
      cur(1),
      { operator: "+" },
      cur(6),
      { operator: "+" },
      cur(3),
    ]);
  });

  it("doesn't delete a field a formula left out would still use", () => {
    assert.deepEqual(applyFieldSuggestion(draft, replaceExpenses, ["s1.1"]), {
      ok: false,
      reason: "stillUsed",
      fieldIds: [5],
    });
  });

  it("doesn't delete a field with a special type", () => {
    const result = applyFieldSuggestion(draft, { ...replaceExpenses, fieldId: 1, changes: [] });
    assert.deepEqual(result, { ok: false, reason: "invalid" });
  });

  it("finds a suggestion whose field has been deleted stale", () => {
    const result = applyFieldSuggestion(draft, { ...replaceExpenses, fieldId: 99 });
    assert.deepEqual(result, { ok: false, reason: "stale" });
  });
});

describe("applySuggestedChange", () => {
  const rename: SuggestedChange = {
    id: "s1.3",
    fieldId: 5,
    fieldName: "Henkilöstökulujen kasvu-%",
    action: "rename",
    name: "Kulujen kasvu-%",
  };

  it("applies a change using a field added by an applied suggestion", () => {
    const applied = applyFieldSuggestion(draft, replaceExpenses, ["s1.1", "s1.2"]);
    assert.ok(applied.ok);
    const change: SuggestedChange = {
      id: "s1.3",
      fieldId: 3,
      fieldName: "Muut kulut",
      action: "formula",
      kind: "estimate",
      formula: [cur("new_1"), { operator: "*" }, { number: 0.5 }],
    };
    const result = applySuggestedChange(applied.draft, change, applied.newFieldIds);
    assert.ok(result.ok);
    assert.deepEqual(result.draft.groups[0].fields[2].estimateDefinition, [
      cur(6),
      { operator: "*" },
      { number: 0.5 },
    ]);
  });

  it("renames a field", () => {
    const result = applySuggestedChange(draft, rename, {});
    assert.ok(result.ok);
    assert.equal(result.draft.groups[0].fields[4].name, "Kulujen kasvu-%");
  });

  it("finds a change using a new field that wasn't added stale", () => {
    const result = applySuggestedChange(draft, replaceExpenses.changes[0], {});
    assert.deepEqual(result, { ok: false, reason: "stale" });
  });
});
