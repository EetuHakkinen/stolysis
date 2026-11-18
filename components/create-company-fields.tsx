"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createCompany, type CompanyFormErrors, type CompanyInput } from "@/actions/companies";
import { ButtonLink } from "@/components/button-link";
import { CompanyReportCheck, MissingFromReportsMarker } from "@/components/company-report-check";
import { ResultFieldGroupList, type ResultFieldGroupActions } from "@/components/result-field-group-settings";
import { ResultFieldList, type ResultFieldActions } from "@/components/result-field-settings";
import { Button } from "@/components/ui/button";
import {
  addDraftField,
  addDraftGroup,
  addRevenueBreakdown,
  deleteDraftField,
  deleteDraftGroup,
  draftFieldErrors,
  draftGroupNameError,
  draftGroupsData,
  renameDraftGroup,
  reorderDraftFields,
  reorderDraftGroups,
  setDraftFieldStarred,
  setRevenueEstimateGroup,
  settingsFromDraft,
  updateDraftField,
  type CompanyDraftSettings,
} from "@/lib/company-draft";
import { clearCompanyDraft, loadCompanyDraft, saveCompanyDraft } from "@/lib/company-draft-storage";
import {
  clearReportCheck,
  getReportCheck,
  markSuggestionApplied,
  startReportCheck,
  subscribeReportCheck,
  reportCheckKey,
} from "@/lib/company-report-check";

const CREATE_COMPANY_PATH = "/dashboard/company/create";

// The second step of creating a company: its result field groups and fields from the draft, edited
// as in the company settings but only in the draft until the company is created. Meanwhile the
// fields are checked against the company's latest reports in the background, once per company and
// reporting cycle; fields a report doesn't have get a red X, and the revenue breakdowns found and
// the changes suggested to the missing fields can be applied. Without a draft, e.g. in a new tab, this goes back to the first step.
export function CreateCompanyFields() {
  const t = useTranslations("CreateCompany");
  const tForm = useTranslations("CompanyForm");
  const router = useRouter();
  const [draft, setDraft] = useState(loadCompanyDraft);
  const [errors, setErrors] = useState<CompanyFormErrors>();
  const [pending, startTransition] = useTransition();
  const storedCheck = useSyncExternalStore(subscribeReportCheck, getReportCheck, () => null);

  useEffect(() => {
    if (!draft) router.replace(CREATE_COMPANY_PATH);
  }, [draft, router]);
  useEffect(() => {
    if (draft) saveCompanyDraft(draft);
  }, [draft]);
  // Once per company and reporting cycle, with the fields as they are when this step first opens.
  const company = draft?.company;
  const reportingCycle = draft?.reportingCycle;
  useEffect(() => {
    const current = loadCompanyDraft();
    if (current) startReportCheck(current);
  }, [company?.name, company?.nasdaqName, reportingCycle]);

  if (!draft) return null;
  const { settings } = draft;
  // A check of another company or reporting cycle is being replaced.
  const check = storedCheck?.key === reportCheckKey(draft.company, draft.reportingCycle) ? storedCheck : null;

  function change(update: (settings: CompanyDraftSettings) => CompanyDraftSettings) {
    setDraft((draft) => draft && { ...draft, settings: update(draft.settings), edited: true });
  }

  const fieldActions: ResultFieldActions = {
    create: async (input) => {
      const errors = draftFieldErrors(settings, input);
      if (!errors) change((settings) => addDraftField(settings, input));
      return errors;
    },
    update: async (fieldId, input) => {
      const errors = draftFieldErrors(settings, input, fieldId);
      if (!errors) change((settings) => updateDraftField(settings, fieldId, input));
      return errors;
    },
    remove: async (fieldId) => change((settings) => deleteDraftField(settings, fieldId)),
    reorder: async (groupId, fieldIds) => change((settings) => reorderDraftFields(settings, groupId, fieldIds)),
    setStarred: async (fieldId, starred) => change((settings) => setDraftFieldStarred(settings, fieldId, starred)),
  };

  const groupActions: ResultFieldGroupActions = {
    create: async (name) => {
      const error = draftGroupNameError(name);
      if (!error) change((settings) => addDraftGroup(settings, name));
      return error;
    },
    rename: async (groupId, name) => {
      const error = draftGroupNameError(name);
      if (!error) change((settings) => renameDraftGroup(settings, groupId, name));
      return error;
    },
    remove: async (groupId) => change((settings) => deleteDraftGroup(settings, groupId)),
    reorder: async (groupIds) => change((settings) => reorderDraftGroups(settings, groupIds)),
  };

  function create() {
    const { company, reportingCycle } = draft!;
    startTransition(async () => {
      const result = await createCompany({ ...company, reportingCycle, settings: settingsFromDraft(settings) });
      if (result.errors) return setErrors(result.errors);
      clearCompanyDraft();
      clearReportCheck();
      router.push("/dashboard");
    });
  }

  const groups = draftGroupsData(settings);
  const errorMessages = Object.entries(errors ?? {}).flatMap(([field, keys]) =>
    (keys ?? []).map((key) => `${tForm(field as keyof CompanyInput)}: ${tForm(`errors.${key}`)}`),
  );

  return (
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground">{t("fieldsDescription")}</p>
      <ResultFieldGroupList groups={groups} actions={groupActions} />
      {check && (
        <CompanyReportCheck
          check={check}
          settings={settings}
          onAddBreakdown={(breakdown) => change((settings) => addRevenueBreakdown(settings, breakdown))}
          onUseBreakdown={(groupId) => change((settings) => setRevenueEstimateGroup(settings, groupId))}
          onApplySuggestion={(ids, result) => {
            change(() => result.draft);
            markSuggestionApplied(check.key, ids, result.newFieldIds);
          }}
        />
      )}
      <ResultFieldList
        groups={groups}
        actions={fieldActions}
        fieldMarker={check ? (fieldId) => <MissingFromReportsMarker check={check} fieldId={fieldId} /> : undefined}
      />
      <div className="flex flex-col gap-2">
        {errorMessages.length > 0 && (
          <div role="alert" className="text-sm text-destructive">
            <p>{t("createError")}</p>
            <ul className="list-disc pl-5">
              {errorMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={create} disabled={pending}>
            {pending ? t("creating") : t("create")}
          </Button>
          <ButtonLink href={CREATE_COMPANY_PATH} variant="outline">
            {t("back")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
