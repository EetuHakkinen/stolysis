import { getTranslations } from "next-intl/server";
import { getNasdaqShares } from "@/actions/companies";
import { CreateCompanyDetailsStep } from "@/components/create-company-steps";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PageHeader } from "@/components/page-header";

export default async function CreateCompany() {
  const [t, shares] = await Promise.all([getTranslations("CompanyForm"), getNasdaqShares()]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumbs items={[{ label: t("title") }]} />
        <PageHeader title={t("title")} />
      </div>
      <CreateCompanyDetailsStep shares={shares} />
    </main>
  );
}
