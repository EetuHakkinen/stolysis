import { getTranslations } from "next-intl/server";
import { createCompany } from "@/actions/companies";
import { CompanyForm } from "@/components/company-form";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";

export default async function CreateCompany() {
  const t = await getTranslations("CompanyForm");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: t("title") }]} />
        <PageHeader title={t("title")} />
      </div>
      <CompanyForm submit={createCompany} cancelHref="/dashboard" />
    </main>
  );
}
