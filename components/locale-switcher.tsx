"use client";

import { useLayoutEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { locales, localeCookie, type Locale } from "@/i18n/config";

function persistLocale(locale: Locale) {
  document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
  applyLang(locale);
}

function applyLang(locale: Locale) {
  document.documentElement.lang = locale;
}

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const current = useLocale();
  const router = useRouter();

  // Re-apply after React clears <html lang> on the dev Strict Mode remount.
  useLayoutEffect(() => applyLang(current), [current]);

  function select(locale: Locale) {
    persistLocale(locale);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t("label")} className="flex gap-1">
      {locales.map((locale) => (
        <Button
          key={locale}
          size="sm"
          variant={locale === current ? "secondary" : "ghost"}
          aria-pressed={locale === current}
          onClick={() => select(locale)}
        >
          {locale.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
