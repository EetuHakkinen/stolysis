import { Fragment } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type Crumb = { label: string; href?: string };

// Trail from the dashboard to the current page. Give the crumbs after the dashboard;
// the last one is the current page and is never a link.
export async function PageBreadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations("Breadcrumbs");
  const crumbs: Crumb[] = [{ label: t("dashboard"), href: "/dashboard" }, ...items];

  return (
    <Breadcrumb aria-label={t("label")}>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {i === crumbs.length - 1 ? (
                // Article titles can be long, so keep the trail on one line.
                <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
              ) : crumb.href ? (
                <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
              ) : (
                <span>{crumb.label}</span>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
