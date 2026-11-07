import { getTranslations } from "next-intl/server";
import { CompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/page-header";

export default async function CreateCompany() {
  const t = await getTranslations("CompanyForm");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-6">
      <PageHeader title={t("title")} />
      <CompanyForm />
    </main>
  );
}
