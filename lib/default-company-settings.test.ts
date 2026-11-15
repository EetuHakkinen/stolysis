import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultCompanySettings,
  settingsProblems,
  settingsWithReporting,
  type CompanySettings,
  type StatementReporting,
} from "./default-company-settings.ts";

describe("defaultCompanySettings", () => {
  it("is valid", () => {
    assert.deepEqual(settingsProblems(defaultCompanySettings), []);
  });
});

describe("settingsProblems", () => {
  const field = (name: string) => ({ field: name, period: "current" as const });

  it("finds duplicate names, invalid formulas, unknown fields and loops", () => {
    const problems = settingsProblems({
      estimateScenarios: ["Perusskenaario", "Perusskenaario"],
      resultFieldGroups: [
        {
          name: "Tuloslaskelma",
          fields: [
            { name: "Liikevaihto" },
            { name: "liikevaihto " },
            { name: "A", estimateDefinition: [field("B")] },
            { name: "B", estimateDefinition: [field("A"), { operator: "+" }] },
            { name: "C", actualDefinition: [field("Puuttuva")] },
            { name: "D", type: "ebit" },
            { name: "E", type: "ebit" },
          ],
        },
      ],
      graphs: [
        { name: "Kaavio", fields: [{ field: "Liikevaihto" }, { field: "Liikevaihto" }] },
        { name: "kaavio", fields: [{ field: "Puuttuva" }] },
      ],
    });
    assert.deepEqual(problems, [
      "Duplicate scenario name: Perusskenaario",
      "Duplicate field name: liikevaihto ",
      "Duplicate type ebit: E",
      "Unknown field in actual formula of C: Puuttuva",
      "Invalid estimate formula of B: missingOperand at 2",
      "The estimate formulas form a loop",
      "Duplicate field in graph Kaavio: Liikevaihto",
      "Duplicate graph name: kaavio",
      "Unknown field in graph kaavio: Puuttuva",
    ]);
  });
});

describe("settingsWithReporting", () => {
  const field = (name: string, period: "current" | "previous" = "current") => ({ field: name, period });
  const settings: CompanySettings = {
    estimateScenarios: [],
    resultFieldGroups: [
      {
        name: "Tuloslaskelma",
        statement: "incomeStatement",
        fields: [
          { name: "Liikevaihto" },
          { name: "Liikevoitto", type: "ebit" },
          { name: "Tuloverot" },
          { name: "Kauden voitto" },
        ],
      },
      {
        name: "Tunnusluvut",
        fields: [
          { name: "Liikevoitto-%", actualDefinition: [field("Liikevoitto"), { operator: "/" }, field("Liikevaihto")] },
          { name: "Tuloveroaste", actualDefinition: [field("Tuloverot")] },
          // Refers to Tuloveroaste, which is reported only yearly because of Tuloverot.
          { name: "Veroaste x 2", actualDefinition: [field("Tuloveroaste"), { operator: "*" }, { number: 2 }] },
        ],
      },
      {
        name: "Tase",
        statement: "balanceSheet",
        fields: [{ name: "Käyttöpääoma", yearlyValue: "last_period" }],
      },
      {
        name: "Rahavirtalaskelma",
        statement: "cashFlow",
        fields: [
          { name: "Käyttöpääoman muutos", actualDefinition: [field("Käyttöpääoma", "previous")] },
          { name: "Maksetut verot", estimateDefinition: [field("Tuloverot")] },
        ],
      },
    ],
    graphs: [],
  };
  const yearlyOnly = (reporting: StatementReporting) =>
    settingsWithReporting(settings, reporting)
      .resultFieldGroups.flatMap((group) => group.fields)
      .filter((field) => field.yearlyValue === "yearly_only")
      .map((field) => field.name);

  it("keeps the settings as they are when everything is reported quarterly", () => {
    const reporting = { incomeStatement: "seasonal", balanceSheet: "seasonal", cashFlow: "seasonal" } as const;
    assert.deepEqual(settingsWithReporting(settings, reporting), settings);
  });

  it("makes the fields after EBIT of a yearly income statement and the fields depending on them yearly-only", () => {
    const reporting = { incomeStatement: "yearly", balanceSheet: "seasonal", cashFlow: "seasonal" } as const;
    // Maksetut verot only has an estimate formula referring to Tuloverot, so it stays quarterly.
    assert.deepEqual(yearlyOnly(reporting), ["Tuloverot", "Kauden voitto", "Tuloveroaste", "Veroaste x 2"]);
  });

  it("makes all fields of a yearly balance sheet or cash flow statement yearly-only", () => {
    assert.deepEqual(yearlyOnly({ incomeStatement: "seasonal", balanceSheet: "yearly", cashFlow: "seasonal" }), [
      "Käyttöpääoma",
      "Käyttöpääoman muutos",
    ]);
    assert.deepEqual(yearlyOnly({ incomeStatement: "seasonal", balanceSheet: "seasonal", cashFlow: "yearly" }), [
      "Käyttöpääoman muutos",
      "Maksetut verot",
    ]);
  });
});
