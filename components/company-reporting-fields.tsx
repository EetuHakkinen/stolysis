"use client";

import { useTranslations } from "next-intl";
import { OptionSelect } from "@/components/option-select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { STATEMENTS, type StatementReporting } from "@/lib/default-company-settings";
import { REPORTING_CYCLES, type ReportingCycle } from "@/lib/financial-year";

// Selects for a new company's reporting cycle and, unless it reports only yearly, for whether it
// reports each financial statement in full every season of the cycle or only yearly.
export function CompanyReportingFields({
  reportingCycle,
  onReportingCycleChange,
  reporting,
  onReportingChange,
}: {
  reportingCycle: ReportingCycle;
  onReportingCycleChange: (reportingCycle: ReportingCycle) => void;
  reporting: StatementReporting;
  onReportingChange: (reporting: StatementReporting) => void;
}) {
  const t = useTranslations("CompanyReporting");
  const frequencies = [
    { value: "seasonal" as const, label: t(`cycles.${reportingCycle}`) },
    { value: "yearly" as const, label: t("cycles.yearly") },
  ];

  return (
    <>
      <Field>
        <FieldLabel htmlFor="reporting-cycle">{t("reportingCycle")}</FieldLabel>
        <OptionSelect
          id="reporting-cycle"
          options={REPORTING_CYCLES.map((cycle) => ({ value: cycle, label: t(`cycles.${cycle}`) }))}
          value={reportingCycle}
          onChange={onReportingCycleChange}
        />
        <FieldDescription>{t("reportingCycleDescription")}</FieldDescription>
      </Field>
      {reportingCycle !== "yearly" &&
        STATEMENTS.map((statement) => (
          <Field key={statement}>
            <FieldLabel htmlFor={`reporting-${statement}`}>{t(`statements.${statement}`)}</FieldLabel>
            <OptionSelect
              id={`reporting-${statement}`}
              options={frequencies}
              value={reporting[statement]}
              onChange={(frequency) => onReportingChange({ ...reporting, [statement]: frequency })}
            />
            <FieldDescription>{t(`descriptions.${statement}`)}</FieldDescription>
          </Field>
        ))}
    </>
  );
}
