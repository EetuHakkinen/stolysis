// Requests and responses of the route handlers under /api/report-check, which check a company's
// result fields against its latest reports while it's being created. Route handlers rather than
// server actions, since the client runs server actions one at a time: the check takes minutes and
// would hold up creating the company. Pure, so it's shared by the client and the server.

import { z } from "zod";
import type { ValueFormat, YearlyValue } from "../app/generated/prisma/enums.ts";
import { REPORTING_CYCLES } from "./financial-year.ts";
import { formulaSchemaOf, type Formula } from "./formulas.ts";

export const REPORT_CHECK_REPORTS_PATH = "/api/report-check/reports";
export const REPORT_CHECK_FIELDS_PATH = "/api/report-check/fields";
export const REPORT_CHECK_SUGGESTIONS_PATH = "/api/report-check/suggestions";

export const reportKindSchema = z.enum(["interim", "statements"]);
// A report found, as the client sends it back.
const checkedReportSchema = z.object({ id: z.number().int(), kind: reportKindSchema, publishedAt: z.iso.datetime() });

// POST REPORT_CHECK_REPORTS_PATH: the company's latest reports.
export const reportsRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nasdaqName: z.string().trim().max(200).optional(),
  reportingCycle: z.enum(REPORTING_CYCLES),
});
export type ReportsRequest = z.input<typeof reportsRequestSchema>;

// A report found for a company being created. The publish time is an ISO string, as the client
// keeps it in session storage.
export type CheckedReport = {
  id: number;
  kind: z.infer<typeof reportKindSchema>;
  title: string;
  publishedAt: string;
  url: string;
};
// Issuer is null when the company has no Nasdaq issuer.
export type ReportsResponse = { issuer: string | null; reports: CheckedReport[] };

// POST REPORT_CHECK_FIELDS_PATH: the fields one of the reports doesn't have, and the breakdowns of
// revenue it has.
export const fieldsRequestSchema = z.object({
  issuer: z.string().trim().min(1).max(200),
  report: checkedReportSchema,
  reportingCycle: z.enum(REPORTING_CYCLES),
  fields: z
    .array(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(300), yearlyOnly: z.boolean() }))
    .max(500),
});
export type FieldsRequest = z.input<typeof fieldsRequestSchema>;
// A breakdown of revenue into categories that together make up the whole revenue, e.g.
// "Liikevaihto alueittain" into Suomi, Ruotsi and Muut maat.
export type RevenueBreakdown = { name: string; categories: string[] };
// Null when the report can't be read.
export type FieldsResponse = { missingFieldIds: number[]; revenueBreakdowns: RevenueBreakdown[] } | null;

// POST REPORT_CHECK_SUGGESTIONS_PATH: changes to the fields the reports don't have, once every
// report has been read. Fields are all the fields of the draft, calculated ones included, so that
// the formulas using a changed field can be changed too. Draft field ids are positive.
export const suggestionsRequestSchema = z.object({
  issuer: z.string().trim().min(1).max(200),
  reports: z.array(checkedReportSchema).min(1).max(2),
  fields: z
    .array(
      z.object({
        id: z.number().int().positive(),
        group: z.string().min(1).max(100),
        name: z.string().min(1).max(100),
        // Fields with a special type are used by the valuation, so they are only renamed.
        typed: z.boolean(),
        yearlyOnly: z.boolean(),
        actualDefinition: formulaSchemaOf(z.number().int().positive()).nullable(),
        estimateDefinition: formulaSchemaOf(z.number().int().positive()).nullable(),
        // Ids of the reports read that don't have the field.
        missingFrom: z.array(z.number().int()).max(2),
      }),
    )
    .max(500),
});
export type SuggestionsRequest = z.input<typeof suggestionsRequestSchema>;

// A field of the draft by its id, or by the key of a field the same suggestion adds.
export type SuggestionFieldRef = number | string;

// A field added in place of a deleted one, in the deleted field's group and place.
export type SuggestedNewField = { key: string; name: string; yearlyValue: YearlyValue; valueFormat: ValueFormat };

// A change to another field that a suggestion calls for: a new formula of either kind (null
// removes an estimate formula, so the estimate is entered), a new name, or deleting the field.
// fieldName is the field's name when the check started.
export type SuggestedChange = { id: string; fieldId: number; fieldName: string } & (
  | { action: "formula"; kind: "actual" | "estimate"; formula: Formula<SuggestionFieldRef> | null }
  | { action: "rename"; name: string }
  | { action: "delete" }
);

// A change to a field the reports don't have: renaming it to what the reports call it, or deleting
// it, possibly with new fields in its place. Ids are unique within the response, and so are the keys
// of new fields. Reasons are in Finnish. fieldName is the field's name when the check started.
export type FieldSuggestion = {
  id: string;
  fieldId: number;
  fieldName: string;
  reason: string;
  changes: SuggestedChange[];
} & ({ action: "rename"; name: string } | { action: "delete"; newFields: SuggestedNewField[] });

export type SuggestionsResponse = { suggestions: FieldSuggestion[] };
