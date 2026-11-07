"use client";

import { useLayoutEffect } from "react";
import { useTranslations } from "next-intl";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultTheme, isTheme, themeCookie, type Theme } from "@/lib/theme";

function readTheme(): Theme {
  const cookie = document.cookie.match(new RegExp(`(?:^|; )${themeCookie}=([^;]*)`))?.[1];
  return isTheme(cookie) ? cookie : defaultTheme;
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function persistTheme(theme: Theme) {
  document.cookie = `${themeCookie}=${theme}; path=/; max-age=31536000; samesite=lax`;
  applyTheme(theme);
}

export function ThemeToggle() {
  const t = useTranslations("ThemeToggle");

  // Re-apply after React resets <html> attributes on the dev Strict Mode remount.
  useLayoutEffect(() => applyTheme(readTheme()), []);

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={t("label")}
      onClick={() => persistTheme(readTheme() === "dark" ? "light" : "dark")}
    >
      {/* Icon follows the .dark class, so no client state or hydration mismatch */}
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}
