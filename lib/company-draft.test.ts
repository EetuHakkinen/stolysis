import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ResultFieldInput } from "@/actions/result-fields";
import {
  addDraftField,
  addRevenueBreakdown,
  addDraftGroup,
  deleteDraftField,
  deleteDraftGroup,
  draftFieldErrors,
  draftFromSettings,
  renameDraftGroup,
  reorderDraftFields,
  revenueEstimateGroupId,
  setRevenueEstimateGroup,
  settingsFromDraft,
  updateDraftField,
} from "./company-draft.ts";
import { defaultCompanySettings, settingsProblems, type CompanySettings } from "./default-company-settings.ts";

const field = (name: string) => ({ field: name, period: "current" as const });
const settings: CompanySettings = {
  estimateScenarios: ["Perusskenaario"],
  resultFieldGroups: [
    {
      name: "Tuloslaskelma",
      statement: "incomeStatement",
      fields: [
        { name: "Liikevaihto", starred: true },
        { name: "Liikevoitto", type: "ebit" },
        {
          name: "Liikevoitto-%",
          valueFormat: "percent",
          actualDefinition: [field("Liikevoitto"), { operator: "/" }, field("Liikevaihto")],
        },
      ],
    },
  ],
  graphs: [
    { name: "Kaavio", fields: [{ field: "Liikevaihto", type: "line" }, { field: "Liikevoitto-%" }] },
    { name: "Liikevoitto", fields: [{ field: "Liikevoitto-%" }] },
  ],
};
const input = (values: Partial<ResultFieldInput>): ResultFieldInput => ({
  groupId: 1,
  name: "Uusi",
  yearlyValue: "sum",
  valueFormat: "money",
  estimateType: "relative",
  type: null,
  actualDefinition: null,
  estimateDefinition: null,
  ...values,
});

describe("draftFromSettings and settingsFromDraft", () => {
  it("turn the settings into a draft and back, with the default values filled in", () => {
    const draft = draftFromSettings(settings);
    assert.deepEqual(draft.groups[0].fields[2].actualDefinition, [
      { field: 2, period: "current" },
      { operator: "/" },
      { field: 1, period: "current" },
    ]);
    assert.deepEqual(settingsFromDraft(draft), {
      estimateScenarios: ["Perusskenaario"],
      resultFieldGroups: [
        {
          name: "Tuloslaskelma",
          fields: [
            { name: "Liikevaihto", yearlyValue: "sum", valueFormat: "money", estimateType: "relative", starred: true },
            {
              name: "Liikevoitto",
              type: "ebit",
              yearlyValue: "sum",
              valueFormat: "money",
              estimateType: "relative",
              starred: false,
            },
            {
              name: "Liikevoitto-%",
              yearlyValue: "sum",
              valueFormat: "percent",
              estimateType: "relative",
              starred: false,
              actualDefinition: settings.resultFieldGroups[0].fields[2].actualDefinition,
            },
          ],
        },
      ],
      graphs: settings.graphs,
    });
  });

  it("keep the default settings valid", () => {
    assert.deepEqual(settingsProblems(settingsFromDraft(draftFromSettings(defaultCompanySettings))), []);
  });

  it("follow renamed fields and leave out deleted ones from graphs", () => {
    let draft = draftFromSettings(settings);
    draft = updateDraftField(draft, 1, input({ name: " Myynti " }));
    // Liikevoitto-% is used by no formula, so it can be deleted.
    draft = deleteDraftField(draft, 3);
    const result = settingsFromDraft(draft);
    assert.deepEqual(result.graphs, [{ name: "Kaavio", fields: [{ field: "Myynti", type: "line" }] }]);
  });
});

describe("draftFieldErrors", () => {
  const draft = draftFromSettings(settings);

  it("finds a missing, too long or taken name and a taken type", () => {
    assert.deepEqual(draftFieldErrors(draft, input({ name: " " })), { name: "required" });
    assert.deepEqual(draftFieldErrors(draft, input({ name: "x".repeat(101) })), { name: "tooLong" });
    assert.deepEqual(draftFieldErrors(draft, input({ name: "liikevaihto " })), { name: "nameTaken" });
    assert.equal(draftFieldErrors(draft, input({ name: "Liikevaihto" }), 1), undefined);
    assert.deepEqual(draftFieldErrors(draft, input({ type: "ebit" })), { type: "typeTaken" });
    assert.equal(draftFieldErrors(draft, input({ name: "Liikevoitto", type: "ebit" }), 2), undefined);
  });

  it("finds invalid formulas, unknown fields and loops", () => {
    assert.deepEqual(
      draftFieldErrors(draft, input({ actualDefinition: [{ field: 1, period: "current" }, { operator: "+" }] })),
      {
        actualDefinition: "missingOperand",
      },
    );
    assert.deepEqual(draftFieldErrors(draft, input({ estimateDefinition: [{ field: 99, period: "current" }] })), {
      estimateDefinition: "unknownField",
    });
    // Liikevoitto-% uses Liikevoitto in its actual formula.
    assert.deepEqual(
      draftFieldErrors(draft, input({ name: "Liikevoitto", actualDefinition: [{ field: 3, period: "current" }] }), 2),
      { actualDefinition: "cycle" },
    );
    assert.equal(
      draftFieldErrors(draft, input({ name: "Liikevoitto", estimateDefinition: [{ field: 3, period: "current" }] }), 2),
      undefined,
    );
  });
});

describe("draft changes", () => {
  it("add, move, reorder and delete fields and groups", () => {
    let draft = draftFromSettings(settings);
    draft = addDraftGroup(draft, " Tase ");
    assert.deepEqual(
      draft.groups.map((group) => [group.id, group.name]),
      [
        [1, "Tuloslaskelma"],
        [2, "Tase"],
      ],
    );
    draft = addDraftField(draft, input({ groupId: 2, name: "Rahavarat" }));
    assert.equal(draft.groups[1].fields[0].id, 4);
    // A group with fields isn't deleted.
    assert.equal(deleteDraftGroup(draft, 2).groups.length, 2);
    // A field used by a formula isn't deleted.
    assert.equal(deleteDraftField(draft, 1).groups[0].fields.length, 3);

    draft = updateDraftField(draft, 4, input({ groupId: 1, name: "Rahavarat" }));
    assert.deepEqual(
      draft.groups.map((group) => group.fields.map((field) => field.id)),
      [[1, 2, 3, 4], []],
    );
    draft = reorderDraftFields(draft, 1, [4, 3, 2, 1]);
    assert.deepEqual(
      draft.groups[0].fields.map((field) => field.id),
      [4, 3, 2, 1],
    );
    // Ids that aren't exactly the group's fields are ignored.
    assert.deepEqual(
      reorderDraftFields(draft, 1, [4, 3]).groups[0].fields.map((field) => field.id),
      [4, 3, 2, 1],
    );
    draft = renameDraftGroup(deleteDraftGroup(draft, 2), 1, "Tulos");
    assert.deepEqual(
      draft.groups.map((group) => group.name),
      ["Tulos"],
    );
  });
});

describe("revenue breakdowns", () => {
  const withRevenue = draftFromSettings({
    estimateScenarios: [],
    resultFieldGroups: [
      { name: "Tunnusluvut", fields: [{ name: "Muut" }] },
      { name: "Tuloslaskelma", fields: [{ name: "Liikevaihto", type: "revenue" }, { name: "Liikevoitto" }] },
    ],
    graphs: [],
  });
  const regions = { name: "Liikevaihto alueittain", categories: ["Suomi", "Muut"] };
  const products = { name: "Liikevaihto tuotteittain", categories: ["Saunat", "Muut"] };
  const sum = (...ids: number[]) =>
    ids.flatMap((field, index) => [...(index > 0 ? [{ operator: "+" }] : []), { field, period: "current" }]);

  it("adds a breakdown before the revenue group and makes the revenue estimate its sum", () => {
    const draft = addRevenueBreakdown(withRevenue, regions);
    assert.deepEqual(
      draft.groups.map((group) => group.name),
      ["Tunnusluvut", "Liikevaihto alueittain", "Tuloslaskelma"],
    );
    // Muut is taken by another field.
    assert.deepEqual(
      draft.groups[1].fields.map((field) => [field.id, field.name]),
      [
        [4, "Suomi"],
        [5, "Muut (Liikevaihto alueittain)"],
      ],
    );
    assert.deepEqual(draft.groups[2].fields[0].estimateDefinition, sum(4, 5));
    assert.equal(revenueEstimateGroupId(draft), draft.groups[1].id);
    // Not added twice.
    assert.equal(addRevenueBreakdown(draft, { ...regions, name: "liikevaihto alueittain" }), draft);
  });

  it("keeps the revenue estimate on the first breakdown until another one is chosen", () => {
    let draft = addRevenueBreakdown(addRevenueBreakdown(withRevenue, regions), products);
    const productsGroup = draft.groups.find((group) => group.name === products.name)!;
    assert.deepEqual(
      productsGroup.fields.map((field) => field.name),
      ["Saunat", "Muut (Liikevaihto tuotteittain)"],
    );
    assert.equal(revenueEstimateGroupId(draft), draft.groups.find((group) => group.name === regions.name)!.id);
    draft = setRevenueEstimateGroup(draft, productsGroup.id);
    assert.equal(revenueEstimateGroupId(draft), productsGroup.id);
  });
});
