import type { BusinessAnalysisCategory } from "@/app/generated/prisma/enums";
import { latestRows } from "./latest-rows.ts";

// Helpers for the sections of a company's business analysis. Pure, so they run in tests without a db.

// Sections in the order they are shown.
export const BUSINESS_ANALYSIS_CATEGORIES = [
  "company_description",
  "business_model",
  "products",
  "markets_and_competitors",
  "strategy",
  "acquisitions",
  "risks",
] as const satisfies readonly BusinessAnalysisCategory[];

// A version of a section; newsId is null for versions written by hand.
export type SectionVersion = {
  id: number;
  category: BusinessAnalysisCategory;
  content: string;
  newsId: number | null;
};

// The current version of each section, from versions read newest first (by createdAt, then id),
// by category. Sections without versions are missing.
export function currentSections<T extends SectionVersion>(rows: T[]): Map<BusinessAnalysisCategory, T> {
  return new Map(latestRows(rows, (row) => row.category).map((row) => [row.category, row]));
}

// Whether the sections still have the same current versions, i.e. none was written in between.
export function sameVersions(
  a: Map<BusinessAnalysisCategory, { id: number }>,
  b: Map<BusinessAnalysisCategory, { id: number }>,
): boolean {
  return (
    a.size === b.size && [...a].every(([category, version]) => b.get(category)?.id === version.id)
  );
}

// New versions to save from the AI's updates: trimmed, without empty texts or texts equal to the
// current version, and at most one per section (the first).
export function newVersions(
  current: Map<BusinessAnalysisCategory, { content: string }>,
  updates: { category: BusinessAnalysisCategory; content: string }[],
): { category: BusinessAnalysisCategory; content: string }[] {
  const versions = new Map<BusinessAnalysisCategory, string>();
  for (const update of updates) {
    const content = update.content.trim();
    if (!content || versions.has(update.category)) continue;
    if (content === current.get(update.category)?.content.trim()) continue;
    versions.set(update.category, content);
  }
  return [...versions].map(([category, content]) => ({ category, content }));
}

// The current analysis for the AI, a section per heading, telling which sections were written by
// hand and which are empty.
export function analysisForPrompt(current: Map<BusinessAnalysisCategory, SectionVersion>): string {
  return BUSINESS_ANALYSIS_CATEGORIES.map((category) => {
    const version = current.get(category);
    if (!version) return `<section category="${category}" empty="true" />`;
    const manual = version.newsId == null ? ` written_by_hand="true"` : "";
    return `<section category="${category}"${manual}>\n${version.content.trim()}\n</section>`;
  }).join("\n\n");
}

// A change to the business analysis: the new versions of the sections that one news item updated,
// or a section edited by hand, with each section's text before it ("" for none).
export type AnalysisChange<T> = {
  key: string;
  // The change's first version, e.g. for its time and news.
  first: T;
  changes: { category: BusinessAnalysisCategory; before: string; after: string }[];
};

// The versions read newest first (by createdAt, then id) as changes, newest first. A news item's
// versions make one change; each version written by hand is a change of its own.
export function analysisChanges<T extends SectionVersion>(rows: T[]): AnalysisChange<T>[] {
  const previous = new Map<BusinessAnalysisCategory, string>();
  const changes = new Map<string, AnalysisChange<T>>();
  for (const row of [...rows].reverse()) {
    const key = row.newsId != null ? `news-${row.newsId}` : `manual-${row.id}`;
    const change = changes.get(key) ?? { key, first: row, changes: [] };
    change.changes.push({ category: row.category, before: previous.get(row.category) ?? "", after: row.content });
    changes.set(key, change);
    previous.set(row.category, row.content);
  }
  const order = (category: BusinessAnalysisCategory) => BUSINESS_ANALYSIS_CATEGORIES.indexOf(category);
  return [...changes.values()]
    .map((change) => ({ ...change, changes: change.changes.sort((a, b) => order(a.category) - order(b.category)) }))
    .reverse();
}
