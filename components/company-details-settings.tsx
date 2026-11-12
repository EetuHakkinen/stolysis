"use client";

import { useTranslations } from "next-intl";
import { updateCompany } from "@/actions/companies";
import { CompanyForm } from "@/components/company-form";

// Company settings section for editing the company's name and ticker.
export function CompanyDetailsSettings({
  company,
}: {
  company: { id: number; name: string; ticker: string };
}) {
  const t = useTranslations("CompanySettings");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("details")}</h2>
      <CompanyForm
        initialValues={{ name: company.name, ticker: company.ticker }}
        submit={(values) => updateCompany({ companyId: company.id, ...values })}
        inline
      />
    </section>
  );
}
