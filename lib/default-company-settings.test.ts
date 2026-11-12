import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCompanySettings, settingsProblems } from "./default-company-settings.ts";

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
          ],
        },
      ],
    });
    assert.deepEqual(problems, [
      "Duplicate scenario name: Perusskenaario",
      "Duplicate field name: liikevaihto ",
      "Unknown field in actual formula of C: Puuttuva",
      "Invalid estimate formula of B: missingOperand at 2",
      "The estimate formulas form a loop",
    ]);
  });
});
