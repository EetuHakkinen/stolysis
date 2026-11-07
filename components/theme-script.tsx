import { InlineScript } from "@/components/inline-script";
import { defaultTheme, themeCookie, themes } from "@/lib/theme";

// Applies the theme cookie to <html> before paint, so the root layout stays
// static and there's no flash of the default theme.
const script = `(() => {
  const themes = ${JSON.stringify(themes)};
  const cookie = document.cookie.match(/(?:^|; )${themeCookie}=([^;]*)/)?.[1];
  const theme = themes.includes(cookie) ? cookie : ${JSON.stringify(defaultTheme)};
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
})();`;

export function ThemeScript() {
  return <InlineScript html={script} />;
}
