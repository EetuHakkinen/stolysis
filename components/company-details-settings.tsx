"use client";

import { useTranslations } from "next-intl";
import { updateCompany } from "@/actions/companies";
import { CompanyForm } from "@/components/company-form";

// Company settings section for editing the company's name, ticker, price symbol and Nasdaq issuer.
export function CompanyDetailsSettings({
  company,
  issuers,
}: {
  company: { id: number; name: string; ticker: string; priceSymbol: string | null; nasdaqName: string | null };
  issuers: string[];
}) {
  const t = useTranslations("CompanySettings");

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{t("details")}</h2>
      <CompanyForm
        initialValues={{
          name: company.name,
          ticker: company.ticker,
          priceSymbol: company.priceSymbol ?? "",
          nasdaqName: company.nasdaqName ?? "",
        }}
        submit={(values) => updateCompany({ companyId: company.id, ...values })}
        inline
        withPriceSymbol
        nasdaqIssuers={issuers}
      />
    </section>
  );
}
