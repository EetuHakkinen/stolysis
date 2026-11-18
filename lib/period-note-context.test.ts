import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { figuresForPrompt, notesForPrompt, wasEdited, yearBefore } from "./period-note-context.ts";

describe("yearBefore", () => {
  it("is the same day a year earlier", () => {
    assert.equal(yearBefore("2026-10-27"), "2025-10-27");
  });

  it("moves 29 February to 28 February", () => {
    assert.equal(yearBefore("2028-02-29"), "2027-02-28");
  });
});

describe("notesForPrompt", () => {
  const notes = [
    { date: "2026-10-01", text: "Uusin", aiGenerated: false },
    { date: "2026-07-20", text: "Kausikatsaus Q2", aiGenerated: true },
    { date: "2026-01-05", text: "Vanhin muistiinpano", aiGenerated: false },
  ];

  it("lists the notes oldest first, marking AI notes", () => {
    assert.equal(
      notesForPrompt(notes, 1000),
      [
        '<note date="2026-01-05">\nVanhin muistiinpano\n</note>',
        '<note date="2026-07-20" ai_generated="true">\nKausikatsaus Q2\n</note>',
        '<note date="2026-10-01">\nUusin\n</note>',
      ].join("\n\n"),
    );
  });

  it("leaves out the oldest notes that don't fit", () => {
    assert.equal(
      notesForPrompt(notes, "Uusin".length + "Kausikatsaus Q2".length),
      ['<note date="2026-07-20" ai_generated="true">\nKausikatsaus Q2\n</note>', '<note date="2026-10-01">\nUusin\n</note>'].join(
        "\n\n",
      ),
    );
  });

  it("says when there are none", () => {
    assert.equal(notesForPrompt([{ date: "2026-01-01", text: "  ", aiGenerated: false }], 1000), "(no notes)");
  });
});

describe("figuresForPrompt", () => {
  it("groups figures by period in their unit and format", () => {
    assert.equal(
      figuresForPrompt([
        { period: "Q3/2026", field: "Liikevaihto", valueFormat: "money", value: 45_678_000, unit: "million" },
        { period: "Q3/2026", field: "EPS", valueFormat: "per_share", value: 0.42, unit: "million" },
        { period: "Q3/2026", field: "Poistettu", valueFormat: "money", value: null, unit: "million" },
        { period: "Q3/2025", field: "Liikevaihto", valueFormat: "money", value: 41_250, unit: "thousand" },
      ]),
      "Q3/2026:\n- Liikevaihto: 45.68 M€\n- EPS: 0.42 €/osake\n\nQ3/2025:\n- Liikevaihto: 41.25 t€",
    );
  });

  it("says when there are none", () => {
    assert.equal(figuresForPrompt([]), "(no figures)");
  });
});

describe("wasEdited", () => {
  it("is true only when updated after creation", () => {
    const createdAt = new Date("2026-10-27T08:00:00Z");
    assert.equal(wasEdited({ createdAt, updatedAt: createdAt }), false);
    assert.equal(wasEdited({ createdAt, updatedAt: new Date("2026-10-27T09:00:00Z") }), true);
  });
});
