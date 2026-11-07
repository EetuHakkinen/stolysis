import { InlineScript } from "@/components/inline-script";
import { defaultLocale, localeCookie, locales } from "@/i18n/config";

// Sets <html lang> from the locale cookie (or browser languages) before paint,
// so the root layout stays static instead of reading cookies on the server.
const script = `(() => {
  const locales = ${JSON.stringify(locales)};
  const cookie = document.cookie.match(/(?:^|; )${localeCookie}=([^;]*)/)?.[1];
  const preferred = [cookie, ...navigator.languages.map((l) => l.split("-")[0])];
  document.documentElement.lang = preferred.find((l) => locales.includes(l)) ?? ${JSON.stringify(defaultLocale)};
})();`;

export function HtmlLangScript() {
  return <InlineScript html={script} />;
}
