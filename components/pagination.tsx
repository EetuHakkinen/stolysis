import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";

// Previous/next links with a "page X / Y" indicator. Pages are 1-based.
export async function Pagination({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  const t = await getTranslations("Pagination");
  if (pageCount <= 1) return null;

  const previous = (
    <>
      <ChevronLeftIcon />
      {t("previous")}
    </>
  );
  const next = (
    <>
      {t("next")}
      <ChevronRightIcon />
    </>
  );

  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <ButtonLink href={href(page - 1)} variant="outline" size="sm">
          {previous}
        </ButtonLink>
      ) : (
        <Button variant="outline" size="sm" disabled>
          {previous}
        </Button>
      )}
      <span className="text-sm text-muted-foreground">
        {t("pageOf", { page, pageCount })}
      </span>
      {page < pageCount ? (
        <ButtonLink href={href(page + 1)} variant="outline" size="sm">
          {next}
        </ButtonLink>
      ) : (
        <Button variant="outline" size="sm" disabled>
          {next}
        </Button>
      )}
    </nav>
  );
}

// Reads the 1-based page number from a `?page=` search param, defaulting to 1.
export function parsePage(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
