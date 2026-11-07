import Link from "next/link";
import { Badge } from "@/components/ui/badge";

// Company name as a tag that links to the company page.
export function CompanyBadge({ company }: { company: { name: string; ticker: string } }) {
  return (
    <Badge
      variant="secondary"
      render={<Link href={`/dashboard/company/${encodeURIComponent(company.ticker)}`} />}
    >
      {company.name}
    </Badge>
  );
}
