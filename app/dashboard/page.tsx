import { PlusIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getCompanies } from "@/actions/companies";
import { ButtonLink } from "@/components/button-link";
import { CompaniesTable } from "@/components/companies-table";
import { PageHeader } from "@/components/page-header";

export default async function Dashboard() {
  const t = await getTranslations("Companies");
  const companies = await getCompanies();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <PageHeader title={t("title")}>
        <ButtonLink href="/dashboard/create-company">
          <PlusIcon />
          {t("new")}
        </ButtonLink>
      </PageHeader>
      <CompaniesTable companies={companies} />
    </main>
  );
}
