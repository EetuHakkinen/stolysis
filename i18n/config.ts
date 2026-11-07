export const locales = ["fi", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fi";
export const localeCookie = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

// Picks the first supported language from an Accept-Language-style list.
export function matchLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.split(";")[0].trim().split("-")[0].toLowerCase();
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}
