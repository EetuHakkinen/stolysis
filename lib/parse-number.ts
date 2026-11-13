// Parses a number typed in either locale ("1 234,5", "-1234.5"). Empty text is null; undefined
// means the text isn't a number.
export function parseNumber(text: string): number | null | undefined {
  const normalized = text.replace(/\s/g, "").replace(",", ".").replace("−", "-");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}
