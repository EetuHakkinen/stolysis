import { getTranslations } from "next-intl/server";
import { getCompanies } from "@/actions/companies";
import { CompaniesTable } from "@/components/companies-table";

export default async function Dashboard() {
  const t = await getTranslations("Companies");
  const companies = await getCompanies();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <CompaniesTable companies={companies} />
    </main>
  );
}
