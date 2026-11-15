// Helpers for fetching company news from Nasdaq Nordic. Pure, so they run in tests without a db.

// News are checked from Nasdaq at most this often when a company's page is opened.
export const NEWS_FETCH_INTERVAL_MS = 4 * 60 * 60 * 1000;

// How far back news are fetched for a company that has none from Nasdaq yet.
export const NEWS_HISTORY_YEARS = 5;

// News saved from email or by URL and an announcement released at most this far apart in time
// can be the same release.
export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

// Company forms and words that the company's own name may leave out, e.g. "Revenio" for
// "Revenio Group Oyj".
const NAME_SUFFIXES = ["oyj", "abp", "plc", "corporation", "corp", "group", "oy", "ab", "ltd"];

// Whether the company's news should be checked: never checked, or checked at least 4 hours ago.
export function needsNewsFetch({ fetchedAt, now }: { fetchedAt: Date | null; now: Date }): boolean {
  return fetchedAt == null || now.getTime() - fetchedAt.getTime() >= NEWS_FETCH_INTERVAL_MS;
}

// Time to fetch news from: the release time of the latest news fetched from Nasdaq, or 5 years
// back when there is none. News received by email don't count: a release received by email may be
// newer than releases not fetched yet.
export function newsFetchStart(latestNasdaqNews: Date | null, now: Date): Date {
  if (latestNasdaqNews) return latestNasdaqNews;
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - NEWS_HISTORY_YEARS);
  return start;
}

function normalizeName(name: string): string {
  const words = name.toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  while (words.length > 1 && NAME_SUFFIXES.includes(words.at(-1)!)) words.pop();
  return words.join(" ");
}

// The issuer whose name is the company's name, ignoring case and company forms (e.g. "Harvia" and
// "Harvia Oyj"); undefined when no issuer or more than one matches.
export function matchIssuer(companyName: string, issuers: string[]): string | undefined {
  const name = normalizeName(companyName);
  if (!name) return undefined;
  const lower = companyName.trim().toLowerCase();
  const exact = issuers.filter((issuer) => issuer.trim().toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  const matches = issuers.filter((issuer) => normalizeName(issuer) === name);
  return matches.length === 1 ? matches[0] : undefined;
}

// Title for comparing releases: case, whitespace, quotes and dashes vary between sources.
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

type Announcement = { id: number; headline: string; publishedAt: Date };
type ExistingNews = { id: number; title: string; releasedAt: Date };

// Pairs news saved from email or by URL with the announcements that are the same release: the
// same title as the announcement, or as its other-language version (`otherLanguage`, published at
// the same time), released at most 5 minutes apart. Each news item and announcement is paired at
// most once, as a company can publish several releases with the same title at once. Returns the
// news id of each paired announcement.
export function matchExistingNews(
  announcements: Announcement[],
  otherLanguage: Omit<Announcement, "id">[],
  existing: ExistingNews[],
): Map<number, number> {
  const pairs = new Map<number, number>();
  const near = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) <= DUPLICATE_WINDOW_MS;

  const byTime = [...existing].sort((a, b) => a.releasedAt.getTime() - b.releasedAt.getTime() || a.id - b.id);
  for (const news of byTime) {
    const title = normalizeTitle(news.title);
    const candidates = announcements.filter(
      (announcement) => !pairs.has(announcement.id) && near(announcement.publishedAt, news.releasedAt),
    );
    // The same title, else an announcement published at the same time as the other-language
    // version with the title.
    const closest = (list: Announcement[]) =>
      list.sort(
        (a, b) =>
          Math.abs(a.publishedAt.getTime() - news.releasedAt.getTime()) -
          Math.abs(b.publishedAt.getTime() - news.releasedAt.getTime()),
      )[0];
    let match = closest(candidates.filter((announcement) => normalizeTitle(announcement.headline) === title));
    if (!match) {
      const times = otherLanguage
        .filter((other) => normalizeTitle(other.headline) === title && near(other.publishedAt, news.releasedAt))
        .map((other) => other.publishedAt.getTime());
      match = closest(candidates.filter((announcement) => times.includes(announcement.publishedAt.getTime())));
    }
    if (match) pairs.set(match.id, news.id);
  }
  return pairs;
}

type LanguageVersion = {
  language: string;
  languages: string[];
  categoryId: number;
  publishedAt: Date;
};

// The announcements without the translations of releases that the company published as a release
// of its own in each language (e.g. Wärtsilä), which Nasdaq doesn't link together. Single-language
// announcements published at the same time in the same category are the same releases when there
// are as many Finnish as English ones: then only the Finnish ones are kept. Otherwise all are kept,
// so that no release is lost.
export function withoutTranslations<T extends LanguageVersion>(announcements: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const announcement of announcements) {
    if (announcement.languages.length !== 1) continue;
    const key = `${announcement.publishedAt.getTime()}:${announcement.categoryId}`;
    groups.set(key, [...(groups.get(key) ?? []), announcement]);
  }
  const translations = new Set<T>();
  for (const group of groups.values()) {
    const finnish = group.filter((announcement) => announcement.language === "fi");
    const english = group.filter((announcement) => announcement.language === "en");
    if (finnish.length > 0 && finnish.length === english.length) english.forEach((a) => translations.add(a));
  }
  return announcements.filter((announcement) => !translations.has(announcement));
}

// Share class at the end of a share's name: a letter or digit (e.g. "Sampo Oyj A", "Ponsse Oyj 1")
// or the Finnish names of the classes (e.g. "Raisio Oyj Vaihto-osake").
const SHARE_CLASS = /\s+(?:[A-Z]|\d|vaihto-osake|kantaosake)$/i;

// A share's name without its share class, e.g. "Sampo Oyj" for "Sampo Oyj A".
export function withoutShareClass(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(SHARE_CLASS, "");
  return stripped || trimmed;
}

// A share to create a company from: its ticker, its Nasdaq issuer for news (null when no issuer
// matches the share's name, see matchIssuer) and the company's name: the issuer's name, or the
// share's name without its share class when there is no issuer.
export type ShareOption = { ticker: string; name: string; nasdaqName: string | null };

export function shareOptions(shares: { ticker: string; name: string }[], issuers: string[]): ShareOption[] {
  return shares.map((share) => {
    const name = withoutShareClass(share.name);
    const issuer = matchIssuer(name, issuers);
    return { ticker: share.ticker, name: issuer ?? name, nasdaqName: issuer ?? null };
  });
}
