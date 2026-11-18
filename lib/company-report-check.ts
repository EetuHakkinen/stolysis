// The check of a company being created against its latest reports on Nasdaq, run in the background
// while its result fields are reviewed: which entered fields each report doesn't have, the
// breakdowns of revenue it has, and once every report has been read, suggested changes to the
// fields they don't have, which are applied to the draft one by one. It runs once per company and
// reporting cycle: editing the fields doesn't run it again, and fields added afterwards aren't
// checked. Kept in session storage, so a finished check survives reloading the page; a check
// interrupted by reloading starts over. Browser only.

import type { CompanyInput } from "@/actions/companies";
import type { CompanyDraftSettings } from "@/lib/company-draft";
import type { NewFieldIds } from "@/lib/company-draft-suggestions";
import type { ReportingCycle } from "@/lib/financial-year";
import {
  REPORT_CHECK_FIELDS_PATH,
  REPORT_CHECK_REPORTS_PATH,
  REPORT_CHECK_SUGGESTIONS_PATH,
  type CheckedReport,
  type FieldSuggestion,
  type FieldsRequest,
  type FieldsResponse,
  type ReportsRequest,
  type ReportsResponse,
  type RevenueBreakdown,
  type SuggestionsRequest,
  type SuggestionsResponse,
} from "@/lib/report-check-api";

export type ReportCheck = {
  // The company and reporting cycle checked; see reportCheckKey.
  key: string;
  // failed: the reports couldn't be found, e.g. Nasdaq couldn't be reached.
  status: "running" | "done" | "failed";
  // Null until the reports are found, and when the company has no Nasdaq issuer.
  issuer: string | null;
  // Null until found.
  reports: CheckedReport[] | null;
  // Results by report id, once the report has been read; null when it couldn't be read.
  results: Record<number, FieldsResponse>;
  // The fields checked: those entered rather than calculated when the check started.
  checkedFieldIds: number[];
  // Suggested changes to the fields missing from the reports, once every report has been read;
  // null when they couldn't be read.
  suggestions?: FieldSuggestion[] | null;
  // Ids of the suggestions and their changes applied to the draft.
  applied: string[];
  // Ids of the fields added by the applied suggestions.
  newFieldIds: NewFieldIds;
};

const KEY = "company-report-check";
// Changed when the shape of the check changes, so an older check is ignored.
const VERSION = 2;

let check: ReportCheck | null | undefined;
// The check running in this page, which an interrupted one in storage isn't.
let runningKey: string | null = null;
const listeners = new Set<() => void>();

function load(): ReportCheck | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw == null) return null;
    const { version, check } = JSON.parse(raw);
    return version === VERSION ? check : null;
  } catch {
    return null;
  }
}

function set(next: ReportCheck | null) {
  check = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify({ version: VERSION, check: next }));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Kept in memory only.
  }
  for (const listener of listeners) listener();
}

// For useSyncExternalStore.
export function subscribeReportCheck(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReportCheck(): ReportCheck | null {
  if (check === undefined) check = load();
  return check;
}

export function clearReportCheck() {
  runningKey = null;
  set(null);
}

// The company and reporting cycle that decide what's checked: the company's Nasdaq issuer, or
// without one, its name, which the issuer is matched by.
export function reportCheckKey(company: CompanyInput, reportingCycle: ReportingCycle): string {
  const issuer = company.nasdaqName?.trim();
  return JSON.stringify(issuer ? { issuer, reportingCycle } : { name: company.name.trim(), reportingCycle });
}

// Starts checking the draft's entered fields, unless a check of the same company and reporting
// cycle is done or running.
export function startReportCheck({
  company,
  reportingCycle,
  settings,
}: {
  company: CompanyInput;
  reportingCycle: ReportingCycle;
  settings: CompanyDraftSettings;
}) {
  const key = reportCheckKey(company, reportingCycle);
  const current = getReportCheck();
  if (current?.key === key && (current.status !== "running" || runningKey === key)) return;

  // All the fields, for the suggestions; which reports don't have them is added once known.
  const allFields = settings.groups.flatMap((group) =>
    group.fields.map((field) => ({
      id: field.id,
      group: group.name,
      name: field.name,
      typed: field.type != null,
      yearlyOnly: field.yearlyValue === "yearly_only",
      actualDefinition: field.actualDefinition,
      estimateDefinition: field.estimateDefinition,
    })),
  );
  // The entered fields, named as in result extraction, with their group.
  const fields = allFields
    .filter((field) => !field.actualDefinition)
    .map((field) => ({ id: field.id, name: `${field.group}: ${field.name}`, yearlyOnly: field.yearlyOnly }));
  runningKey = key;
  set({
    key,
    status: "running",
    issuer: null,
    reports: null,
    results: {},
    checkedFieldIds: fields.map((f) => f.id),
    applied: [],
    newFieldIds: {},
  });
  void run(key, { name: company.name, nasdaqName: company.nasdaqName, reportingCycle }, fields, allFields);
}

// Marks the suggestions and changes applied to the draft, with the fields they added.
export function markSuggestionApplied(key: string, ids: string[], newFieldIds: NewFieldIds) {
  const current = getReportCheck();
  if (current?.key !== key) return;
  set({
    ...current,
    applied: [...new Set([...current.applied, ...ids])],
    newFieldIds: { ...current.newFieldIds, ...newFieldIds },
  });
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

async function run(
  key: string,
  request: ReportsRequest,
  fields: FieldsRequest["fields"],
  allFields: Omit<SuggestionsRequest["fields"][number], "missingFrom">[],
) {
  // Changes only the check still running, not one started over for another company.
  const update = (change: (check: ReportCheck) => ReportCheck) => {
    const current = getReportCheck();
    if (runningKey === key && current?.key === key) set(change(current));
  };

  let found: ReportsResponse;
  try {
    found = await post<ReportsResponse>(REPORT_CHECK_REPORTS_PATH, request);
  } catch (error) {
    console.error("Finding the company's reports failed", error);
    update((check) => ({ ...check, status: "failed" }));
    if (runningKey === key) runningKey = null;
    return;
  }
  const { issuer, reports } = found;
  update((check) => ({ ...check, issuer, reports }));

  if (issuer) {
    const results = new Map<number, FieldsResponse>();
    await Promise.all(
      reports.map(async (report) => {
        let result: FieldsResponse;
        try {
          result = await post<FieldsResponse>(REPORT_CHECK_FIELDS_PATH, {
            issuer,
            report: { id: report.id, kind: report.kind, publishedAt: report.publishedAt },
            reportingCycle: request.reportingCycle,
            fields,
          } satisfies FieldsRequest);
        } catch (error) {
          console.error("Checking the fields against a report failed", { report: report.id, error });
          result = null;
        }
        results.set(report.id, result);
        update((check) => ({ ...check, results: { ...check.results, [report.id]: result } }));
      }),
    );
    const suggestions = await suggest(issuer, reports, results, allFields);
    update((check) => ({ ...check, suggestions }));
  }
  update((check) => ({ ...check, status: "done" }));
  if (runningKey === key) runningKey = null;
}

// Suggested changes to the fields missing from the reports read; empty without any. Null when
// they couldn't be read.
async function suggest(
  issuer: string,
  reports: CheckedReport[],
  results: Map<number, FieldsResponse>,
  fields: Omit<SuggestionsRequest["fields"][number], "missingFrom">[],
): Promise<FieldSuggestion[] | null> {
  const read = reports.filter((report) => results.get(report.id));
  const withMissing = fields.map((field) => ({
    ...field,
    missingFrom: read.filter((report) => results.get(report.id)!.missingFieldIds.includes(field.id)).map((r) => r.id),
  }));
  if (!withMissing.some((field) => field.missingFrom.length > 0)) return [];
  try {
    const { suggestions } = await post<SuggestionsResponse>(REPORT_CHECK_SUGGESTIONS_PATH, {
      issuer,
      reports: read.map((report) => ({ id: report.id, kind: report.kind, publishedAt: report.publishedAt })),
      fields: withMissing,
    } satisfies SuggestionsRequest);
    return suggestions;
  } catch (error) {
    console.error("Suggesting changes to the fields failed", error);
    return null;
  }
}

// The reports that don't have the field; empty for a field that wasn't checked or is in every
// report read.
export function reportsMissingField(check: ReportCheck, fieldId: number): CheckedReport[] {
  return (check.reports ?? []).filter((report) => check.results[report.id]?.missingFieldIds.includes(fieldId));
}

// The revenue breakdowns found in the reports read so far.
export function revenueBreakdowns(check: ReportCheck): RevenueBreakdown[] {
  return (check.reports ?? []).flatMap((report) => check.results[report.id]?.revenueBreakdowns ?? []);
}

// Steps done and in all: finding the reports, reading each of them, then suggesting changes.
export function reportCheckProgress(check: ReportCheck): { done: number; total: number } {
  if (!check.reports) return { done: 0, total: 1 };
  const reading = check.issuer ? check.reports.length : 0;
  return {
    done: 1 + Object.keys(check.results).length + (check.suggestions === undefined ? 0 : 1),
    total: 1 + reading + (reading > 0 ? 1 : 0),
  };
}
