import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analysisChanges,
  analysisForPrompt,
  currentSections,
  newVersions,
  sameVersions,
  type SectionVersion,
} from "./business-analysis-sections.ts";

// Newest first, as read from the db.
const ROWS: SectionVersion[] = [
  { id: 5, category: "strategy", content: "Uusi strategia", newsId: 12 },
  { id: 4, category: "risks", content: "Riskit käsin", newsId: null },
  { id: 3, category: "strategy", content: "Vanha strategia", newsId: 10 },
  { id: 1, category: "company_description", content: "Yhtiö", newsId: 10 },
];

describe("currentSections", () => {
  it("takes the newest version of each section", () => {
    const current = currentSections(ROWS);
    assert.deepEqual(
      [...current].map(([category, version]) => [category, version.id]),
      [
        ["strategy", 5],
        ["risks", 4],
        ["company_description", 1],
      ],
    );
  });
});

describe("sameVersions", () => {
  it("is true for the same current versions", () => {
    assert.equal(sameVersions(currentSections(ROWS), currentSections([...ROWS])), true);
  });

  it("is false when a section got a new version", () => {
    const newer = [{ id: 6, category: "risks", content: "Uudet riskit", newsId: 13 } as const, ...ROWS];
    assert.equal(sameVersions(currentSections(ROWS), currentSections(newer)), false);
  });

  it("is false when a section got its first version", () => {
    const newer = [{ id: 6, category: "products", content: "Tuotteet", newsId: 13 } as const, ...ROWS];
    assert.equal(sameVersions(currentSections(ROWS), currentSections(newer)), false);
  });
});

describe("newVersions", () => {
  const current = currentSections(ROWS);

  it("keeps changed and new sections, trimmed", () => {
    assert.deepEqual(
      newVersions(current, [
        { category: "strategy", content: "  Päivitetty strategia\n" },
        { category: "products", content: "Tuotteet" },
      ]),
      [
        { category: "strategy", content: "Päivitetty strategia" },
        { category: "products", content: "Tuotteet" },
      ],
    );
  });

  it("leaves out empty and unchanged sections", () => {
    assert.deepEqual(
      newVersions(current, [
        { category: "strategy", content: "Uusi strategia\n" },
        { category: "risks", content: "  " },
      ]),
      [],
    );
  });

  it("keeps the first update of a section", () => {
    assert.deepEqual(
      newVersions(current, [
        { category: "products", content: "Ensimmäinen" },
        { category: "products", content: "Toinen" },
      ]),
      [{ category: "products", content: "Ensimmäinen" }],
    );
  });
});

describe("analysisForPrompt", () => {
  it("lists every section in order, marking empty ones and those written by hand", () => {
    const prompt = analysisForPrompt(currentSections(ROWS));
    assert.equal(
      prompt,
      [
        '<section category="company_description">\nYhtiö\n</section>',
        '<section category="business_model" empty="true" />',
        '<section category="products" empty="true" />',
        '<section category="markets_and_competitors" empty="true" />',
        '<section category="strategy">\nUusi strategia\n</section>',
        '<section category="acquisitions" empty="true" />',
        '<section category="risks" written_by_hand="true">\nRiskit käsin\n</section>',
      ].join("\n\n"),
    );
  });
});


describe("analysisChanges", () => {
  it("groups a news item's versions into one change, newest first, with the texts before", () => {
    const changes = analysisChanges(ROWS).map(({ key, first, changes }) => ({ key, first: first.id, changes }));
    assert.deepEqual(changes, [
      { key: "news-12", first: 5, changes: [{ category: "strategy", before: "Vanha strategia", after: "Uusi strategia" }] },
      { key: "manual-4", first: 4, changes: [{ category: "risks", before: "", after: "Riskit käsin" }] },
      {
        key: "news-10",
        first: 1,
        changes: [
          { category: "company_description", before: "", after: "Yhtiö" },
          { category: "strategy", before: "", after: "Vanha strategia" },
        ],
      },
    ]);
  });
});
