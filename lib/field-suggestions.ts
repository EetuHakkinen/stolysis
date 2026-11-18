import "server-only";
import { z } from "zod";
import type { ContentPart } from "@/lib/openrouter";
import { structuredCompletion } from "@/lib/openrouter";
import { checkFormula, formulaText, parseFormulaText, type Formula } from "@/lib/formulas";
import type {
  CheckedReport,
  FieldSuggestion,
  SuggestedChange,
  SuggestedNewField,
  SuggestionFieldRef,
  SuggestionsRequest,
} from "@/lib/report-check-api";

// Suggestions, read with AI from a company's latest reports, for changing the result fields of a
// company being created that the reports don't have: renaming a field to what the reports call it,
// or deleting it, possibly with new fields in its place, and changing the formulas and other fields
// that use it accordingly.

// Same limit as for the names of fields in the settings page.
const MAX_NAME_LENGTH = 100;
const MAX_REASON_LENGTH = 500;

const REPORT_NAMES: Record<CheckedReport["kind"], string> = {
  interim: "osavuosikatsaus",
  statements: "tilinpäätöstiedote",
};

const INSTRUCTIONS = `You help set up the result fields of a Finnish listed company in an equity analysis tool. The fields are filled in from the company's reports, and the attached PDF reports were checked for each field. Some fields weren't found in a report. For each such field, decide whether to change it so that it matches how the company reports.

For a missing field, return at most one suggestion:
- rename: the report prints the same figure under another name, e.g. "Materiaalit ja palvelut" as "Myytyjä suoritteita vastaava hankintameno". Give the name as the report prints it, translated to Finnish if the report is in English.
- delete: the company doesn't report the figure at all. If the report prints other figures in its place, e.g. "Liiketoiminnan kulut" instead of separate personnel and other expenses, add them in \`newFields\`, named as the report prints them in Finnish. Fields marked "only rename" must never be deleted.
- No suggestion when nothing needs changing, e.g. the figure just isn't printed in an interim report but is in the financial statements release, or the field can be kept as it is.

Other fields use fields in their formulas. A formula is written with fields as [key] (the field's value in the same period) or [key:previous] (its value in the same period a year earlier), numbers, + - * / and parentheses, e.g. "([field_8] / [field_1]) * 100". A field's actual formula calculates its reported values; its estimate formula calculates its estimates. In \`changes\`, list what a suggestion calls for in other fields:
- formula: a new actual or estimate formula for a field whose formula uses a deleted field, using the new fields by their keys where they take its place, e.g. a field calculating the growth of personnel expenses then calculates the growth of the new combined expenses. An empty formula removes an estimate formula, so the estimate is entered by hand instead; an actual formula can't be removed.
- rename: a new name for a field whose name no longer fits, e.g. "Henkilöstökulujen kasvu-%" when its formula now uses "Liiketoiminnan kulut".
- delete: a field that can't be calculated any more without the deleted field. Fields marked "only rename" can't be deleted.
After a delete, no formula may use the deleted field. A rename needs no formula changes, as formulas refer to fields by key, but may call for renaming the fields named after it.

Write \`reason\` briefly in Finnish: what the reports show. Leave \`name\`, \`formula\` and the like empty when they don't apply.`;

const yearlyValues = ["sum", "last_period", "yearly_only"] as const;
const valueFormats = ["money", "percent", "per_share"] as const;

// Values that don't apply are empty strings and lists instead of nullable values: providers limit
// the number of union-typed (e.g. nullable) parameters in a schema.
function suggestionsSchema(missingKeys: string[], fieldKeys: string[]) {
  return z.object({
    suggestions: z.array(
      z.object({
        field: z.enum(missingKeys as [string, ...string[]]).describe("Key of the missing field"),
        action: z.enum(["rename", "delete"]),
        name: z.string().describe("New name of the field when renamed, otherwise empty"),
        reason: z.string().describe("Why, briefly in Finnish"),
        newFields: z
          .array(
            z.object({
              key: z.string().describe("Key for referring to the field in formulas, e.g. new_1"),
              name: z.string(),
              yearlyValue: z
                .enum(yearlyValues)
                .describe(
                  "sum: the year's value is the sum of its seasons (income statement and cash flow items). last_period: the year's value is its last season's (balance sheet items). yearly_only: reported only for whole financial years",
                ),
              valueFormat: z.enum(valueFormats),
            }),
          )
          .describe("Fields added in place of a deleted field, otherwise empty"),
        changes: z.array(
          z.object({
            field: z.enum(fieldKeys as [string, ...string[]]).describe("Key of the field changed"),
            action: z.enum(["formula", "rename", "delete"]),
            kind: z.enum(["actual", "estimate"]).describe("Which formula, for a formula change"),
            formula: z.string().describe("The new formula, for a formula change"),
            name: z.string().describe("The new name, for a rename"),
          }),
        ),
      }),
    ),
  });
}

type Field = SuggestionsRequest["fields"][number];
type Report = Pick<CheckedReport, "id" | "kind">;

const fieldKey = (id: number) => `field_${id}`;

function fieldLine(field: Field, reports: Report[]) {
  const notes = [
    ...(field.typed ? ["only rename"] : []),
    ...(field.yearlyOnly ? ["reported only yearly"] : []),
  ];
  const missing = reports.filter((report) => field.missingFrom.includes(report.id));
  if (missing.length > 0) notes.push(`missing from: ${missing.map((report) => REPORT_NAMES[report.kind]).join(", ")}`);
  const formulas = [
    ...(field.actualDefinition ? [`actual = ${formulaText(field.actualDefinition, fieldKey)}`] : []),
    ...(field.estimateDefinition ? [`estimate = ${formulaText(field.estimateDefinition, fieldKey)}`] : []),
  ];
  return [
    `- ${fieldKey(field.id)}: ${field.name}`,
    ...(notes.length > 0 ? [` (${notes.join("; ")})`] : []),
    ...(formulas.length > 0 ? [`; ${formulas.join("; ")}`] : []),
  ].join("");
}

// The fields by group, in order.
function fieldList(fields: Field[], reports: Report[]) {
  const lines: string[] = [];
  let group: string | undefined;
  for (const field of fields) {
    if (field.group !== group) {
      group = field.group;
      lines.push("", `${group}:`);
    }
    lines.push(fieldLine(field, reports));
  }
  return lines.join("\n");
}

const validName = (name: string) => {
  const trimmed = name.trim();
  return trimmed && trimmed.length <= MAX_NAME_LENGTH ? trimmed : undefined;
};

// Suggestions for the fields missing from the reports, read from their PDFs. Suggestions are
// dropped where the AI breaks the rules: deleting a field with a special type, a name that is empty
// or too long, or a formula that is invalid or refers to an unknown field. Whether the suggestions
// fit the draft as a whole, e.g. that names aren't taken, is checked when they are applied.
export async function suggestFieldChanges({
  pdfs,
  fields,
}: {
  pdfs: (Report & { name: string | null; fileData: string })[];
  fields: Field[];
}): Promise<FieldSuggestion[]> {
  const missing = fields.filter((field) => field.missingFrom.length > 0);
  if (missing.length === 0 || pdfs.length === 0) return [];

  const content: ContentPart[] = [
    { type: "text", text: `Fields:\n${fieldList(fields, pdfs)}` },
    ...pdfs.map((pdf) => ({
      type: "file" as const,
      file: { filename: pdf.name ?? `${REPORT_NAMES[pdf.kind]}.pdf`, file_data: pdf.fileData },
    })),
  ];
  const { suggestions } = await structuredCompletion({
    schemaName: "field_suggestions",
    schema: suggestionsSchema(missing.map((field) => fieldKey(field.id)), fields.map((field) => fieldKey(field.id))),
    messages: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content },
    ],
  });

  const byKey = new Map(fields.map((field) => [fieldKey(field.id), field]));
  const suggested = new Set<number>();
  let newFieldCount = 0;
  return suggestions.flatMap((suggestion, index): FieldSuggestion[] => {
    const field = byKey.get(suggestion.field);
    if (!field || suggested.has(field.id)) return [];
    const id = `s${index + 1}`;
    const reason = suggestion.reason.trim().slice(0, MAX_REASON_LENGTH);

    // New fields get keys unique within the response; formulas refer to them by the AI's keys.
    const newFields: SuggestedNewField[] = [];
    const newKeys = new Map<string, string>();
    if (suggestion.action === "delete") {
      for (const newField of suggestion.newFields) {
        const name = validName(newField.name);
        if (!name || newKeys.has(newField.key)) return [];
        const key = `new_${++newFieldCount}`;
        newKeys.set(newField.key, key);
        newFields.push({ key, name, yearlyValue: newField.yearlyValue, valueFormat: newField.valueFormat });
      }
    }
    const ref = (key: string): SuggestionFieldRef | undefined => newKeys.get(key) ?? byKey.get(key)?.id;

    const changes: SuggestedChange[] = [];
    const changed = new Set<string>();
    for (const change of suggestion.changes) {
      const target = byKey.get(change.field);
      const changeKey = `${change.field}:${change.action}:${change.action === "formula" ? change.kind : ""}`;
      if (!target || target.id === field.id || changed.has(changeKey)) return [];
      changed.add(changeKey);
      const base = { id: `${id}.${changes.length + 1}`, fieldId: target.id, fieldName: target.name };
      if (change.action === "rename") {
        const name = validName(change.name);
        if (!name) return [];
        changes.push({ ...base, action: "rename", name });
      } else if (change.action === "delete") {
        if (target.typed) return [];
        changes.push({ ...base, action: "delete" });
      } else {
        let formula: Formula<SuggestionFieldRef> | null = null;
        if (change.formula.trim()) {
          const parsed = parseFormulaText(change.formula, ref);
          if (!parsed || checkFormula(parsed)) return [];
          formula = parsed;
        } else if (change.kind === "actual") {
          return [];
        }
        changes.push({ ...base, action: "formula", kind: change.kind, formula });
      }
    }

    if (suggestion.action === "rename") {
      const name = validName(suggestion.name);
      if (!name || name === field.name) return [];
      suggested.add(field.id);
      return [{ id, fieldId: field.id, fieldName: field.name, reason, changes, action: "rename", name }];
    }
    if (field.typed) return [];
    suggested.add(field.id);
    return [{ id, fieldId: field.id, fieldName: field.name, reason, changes, action: "delete", newFields }];
  });
}
