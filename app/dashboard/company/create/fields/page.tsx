import { getTranslations } from "next-intl/server";
import { CreateCompanyFieldsStep } from "@/components/create-company-steps";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";

export default async function CreateCompanyFieldsPage() {
  const [tForm, t] = await Promise.all([getTranslations("CompanyForm"), getTranslations("CreateCompany")]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs
          items={[{ label: tForm("title"), href: "/dashboard/company/create" }, { label: t("fieldsTitle") }]}
        />
        <PageHeader title={`${tForm("title")}: ${t("fieldsTitle")}`} />
      </div>
      <CreateCompanyFieldsStep />
    </main>
  );
}
