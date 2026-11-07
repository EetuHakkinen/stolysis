export const themes = ["dark", "light"] as const;
export type Theme = (typeof themes)[number];

export const defaultTheme: Theme = "dark";
export const themeCookie = "theme";

export function isTheme(value: unknown): value is Theme {
  return themes.includes(value as Theme);
}
