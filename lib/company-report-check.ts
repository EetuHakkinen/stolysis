// The check of a company being created against its latest reports on Nasdaq, run in the background
// while its result fields are reviewed: which entered fields each report doesn't have, and the
// breakdowns of revenue it has. It runs once per company and reporting cycle: editing the fields
// doesn't run it again, and fields added afterwards aren't checked. Kept in session storage, so a
// finished check survives reloading the page; a check interrupted by reloading starts over. Browser
// only.

import type { CompanyInput } from "@/actions/companies";
import type { CompanyDraftSettings } from "@/lib/company-draft";
import type { ReportingCycle } from "@/lib/financial-year";
import {
  REPORT_CHECK_FIELDS_PATH,
  REPORT_CHECK_REPORTS_PATH,
  type CheckedReport,
  type FieldsRequest,
  type FieldsResponse,
  type ReportsRequest,
  type ReportsResponse,
  type RevenueBreakdown,
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
};

const KEY = "company-report-check";
// Changed when the shape of the check changes, so an older check is ignored.
const VERSION = 1;

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

  // Named as in result extraction, with their group.
  const fields = settings.groups.flatMap((group) =>
    group.fields
      .filter((field) => !field.actualDefinition)
      .map((field) => ({
        id: field.id,
        name: `${group.name}: ${field.name}`,
        yearlyOnly: field.yearlyValue === "yearly_only",
      })),
  );
  runningKey = key;
  set({ key, status: "running", issuer: null, reports: null, results: {}, checkedFieldIds: fields.map((f) => f.id) });
  void run(key, { name: company.name, nasdaqName: company.nasdaqName, reportingCycle }, fields);
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

async function run(key: string, request: ReportsRequest, fields: FieldsRequest["fields"]) {
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
        update((check) => ({ ...check, results: { ...check.results, [report.id]: result } }));
      }),
    );
  }
  update((check) => ({ ...check, status: "done" }));
  if (runningKey === key) runningKey = null;
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

// Steps done and in all: finding the reports, then reading each of them.
export function reportCheckProgress(check: ReportCheck): { done: number; total: number } {
  if (!check.reports) return { done: 0, total: 1 };
  return { done: 1 + Object.keys(check.results).length, total: 1 + (check.issuer ? check.reports.length : 0) };
}
