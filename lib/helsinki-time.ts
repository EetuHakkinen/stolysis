// Company data (financial years, stock exchange releases) is in Finnish local time.
export const TIME_ZONE = "Europe/Helsinki";

// Offset of the time zone from UTC (in ms) at the given instant.
function timeZoneOffset(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Instant of the given local wall-clock time in Finland (month is 0-based, may overflow).
export function helsinkiTime(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const asUtc = Date.UTC(year, month, day, hour, minute);
  return new Date(asUtc - timeZoneOffset(new Date(asUtc)));
}

// Local calendar date in Finland of the given instant (month is 0-based).
export function helsinkiDate(date: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  return { year: parts.year, month: parts.month - 1, day: parts.day };
}
