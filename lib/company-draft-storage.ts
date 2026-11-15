// The company being created, kept between the steps of creating it: its details and reporting
// choices from the first step, and its result fields from the second. Kept in session storage, so
// it survives reloading the page but not closing the tab. Browser only. Without session storage,
// e.g. when it's blocked, the draft is kept in memory, which lasts until the page is reloaded.

import type { CompanyInput } from "@/actions/companies";
import type { CompanyDraftSettings } from "@/lib/company-draft";
import type { StatementReporting } from "@/lib/default-company-settings";
import type { ReportingCycle } from "@/lib/financial-year";

export type StoredCompanyDraft = {
  company: CompanyInput;
  reportingCycle: ReportingCycle;
  reporting: StatementReporting;
  settings: CompanyDraftSettings;
  // Whether the result fields have been changed in the second step.
  edited: boolean;
};

const KEY = "company-draft";
// Changed when the shape of the draft changes, so an older draft is ignored.
const VERSION = 1;

let memory: StoredCompanyDraft | null = null;

export function loadCompanyDraft(): StoredCompanyDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw == null) return memory;
    const { version, draft } = JSON.parse(raw);
    return version === VERSION ? draft : null;
  } catch {
    return memory;
  }
}

export function saveCompanyDraft(draft: StoredCompanyDraft) {
  memory = draft;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ version: VERSION, draft }));
  } catch {
    // Kept in memory only.
  }
}

export function clearCompanyDraft() {
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
