import { helsinkiTime } from "@/lib/helsinki-time";

// Parsing helpers for stock exchange releases received by email. Pure functions, no db access.

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// UTC offsets (in hours) of the time zone abbreviations used in releases.
const TIME_ZONE_OFFSETS: Record<string, number> = {
  EET: 2,
  EEST: 3,
  CET: 1,
  CEST: 2,
  UTC: 0,
  GMT: 0,
};

const MONTH = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\.?";
const TIME = "(\\d{1,2})[:.](\\d{2})(?:\\s*([ap])\\.?\\s?m\\.?)?";
const ZONE = `(?:\\s*(${Object.keys(TIME_ZONE_OFFSETS).join("|")})\\b)?`;

// Release lines such as:
//   "7 November 2026 at 9:00 EET", "November 7, 2026 at 9:00 a.m. EET", "7.11.2026 klo 9.00"
const RELEASE_TIME_PATTERNS: {
  regex: RegExp;
  parts: (m: RegExpExecArray) => [day: string, month: number, year: string, rest: string[]];
}[] = [
  {
    regex: new RegExp(`(\\d{1,2})\\.?\\s+${MONTH}\\s+(\\d{4}),?\\s+at\\s+${TIME}${ZONE}`, "i"),
    parts: (m) => [m[1], monthIndex(m[2]), m[3], m.slice(4)],
  },
  {
    regex: new RegExp(`${MONTH}\\s+(\\d{1,2}),?\\s+(\\d{4}),?\\s+at\\s+${TIME}${ZONE}`, "i"),
    parts: (m) => [m[2], monthIndex(m[1]), m[3], m.slice(4)],
  },
  {
    regex: new RegExp(`(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})\\s+klo\\s+${TIME}${ZONE}`, "i"),
    parts: (m) => [m[1], Number(m[2]) - 1, m[3], m.slice(4)],
  },
];

function monthIndex(name: string): number {
  const prefix = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((month) => month.startsWith(prefix));
}

// Release time from the first release line in the text. Times without a time zone are Finnish local time.
export function parseReleaseTime(text: string): Date | undefined {
  const first = RELEASE_TIME_PATTERNS.map(({ regex, parts }) => {
    const match = regex.exec(text);
    return match && { index: match.index, parts: parts(match) };
  })
    .filter((match) => match !== null)
    .sort((a, b) => a.index - b.index)[0];
  if (!first) return undefined;

  const [day, month, year, [hourText, minuteText, meridiem, zone]] = first.parts;
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);
  }
  if (month < 0 || month > 11 || Number(day) < 1 || Number(day) > 31 || hour > 23 || minute > 59) {
    return undefined;
  }

  if (zone) {
    const offset = TIME_ZONE_OFFSETS[zone.toUpperCase()];
    return new Date(Date.UTC(Number(year), month, Number(day), hour - offset, minute));
  }
  return helsinkiTime(Number(year), month, Number(day), hour, minute);
}

// Date header from the raw email headers SendGrid posts in the `headers` field.
export function parseDateHeader(headers: string): Date | undefined {
  // Folded header lines continue on lines starting with whitespace.
  const match = headers.match(/^Date:[ \t]*(.+(?:\r?\n[ \t].*)*)/im);
  if (!match) return undefined;
  const date = new Date(match[1].replace(/\r?\n[ \t]+/g, " ").trim());
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "zip"];

// Links to documents (by file extension) in the plain text and HTML hrefs, without duplicates.
// The name is the file name from the URL.
export function findDocumentLinks(text: string, html = ""): { url: string; name: string }[] {
  const candidates = [
    ...(text.match(/https?:\/\/[^\s<>"']+/g) ?? []),
    ...[...html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => decodeEntities(m[1])),
  ].map((url) => url.replace(/[.,;:!?)\]]+$/, ""));

  const links = new Map<string, string>();
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    const fileName = url.pathname.split("/").pop() ?? "";
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!fileName.includes(".") || !DOCUMENT_EXTENSIONS.includes(extension)) continue;
    if (!links.has(url.href)) links.set(url.href, safeDecode(fileName));
  }
  return [...links].map(([url, name]) => ({ url, name }));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

// Plain text version of an HTML body, for emails that have no text part.
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type CompanyCandidate = { id: number; name: string; ticker: string };

// The single company whose name (case-insensitive) or ticker (exact) appears as a whole word.
// The subject is checked first; the body only when the subject mentions no company.
// Returns undefined when nothing matches or the match is ambiguous.
export function matchCompany<T extends CompanyCandidate>(
  companies: T[],
  { subject, text }: { subject: string; text: string },
): T | undefined {
  for (const source of [subject, text]) {
    const matches = companies.filter(
      (company) =>
        containsWord(source, company.name, "iu") || containsWord(source, company.ticker, "u"),
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return undefined;
  }
  return undefined;
}

function containsWord(source: string, word: string, flags: string): boolean {
  if (!word.trim()) return false;
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags).test(source);
}
