import { getTranslations } from "next-intl/server";
import type { Company } from "@/app/generated/prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function CompaniesTable({ companies }: { companies: Company[] }) {
  const t = await getTranslations("Companies");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("name")}</TableHead>
          <TableHead>{t("ticker")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {companies.length === 0 ? (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground">
              {t("empty")}
            </TableCell>
          </TableRow>
        ) : (
          companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell>{company.name}</TableCell>
              <TableCell className="font-mono">{company.ticker}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
