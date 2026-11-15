// Requests and responses of the route handlers under /api/report-check, which check a company's
// result fields against its latest reports while it's being created. Route handlers rather than
// server actions, since the client runs server actions one at a time: the check takes minutes and
// would hold up creating the company. Pure, so it's shared by the client and the server.

import { z } from "zod";
import { REPORTING_CYCLES } from "./financial-year.ts";

export const REPORT_CHECK_REPORTS_PATH = "/api/report-check/reports";
export const REPORT_CHECK_FIELDS_PATH = "/api/report-check/fields";

export const reportKindSchema = z.enum(["interim", "statements"]);

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
  report: z.object({ id: z.number().int(), kind: reportKindSchema, publishedAt: z.iso.datetime() }),
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
