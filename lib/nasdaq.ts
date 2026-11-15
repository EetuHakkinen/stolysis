import "server-only";
import { cacheLife } from "next/cache";
import { z } from "zod";
import { htmlToText } from "@/lib/news-email";

// Minimal client of Nasdaq Nordic's company announcements, the API behind
// https://www.nasdaq.com/european-market-activity/news/company-news. It is undocumented, so
// responses are validated.

const API_URL = "https://api.news.eu.nasdaq.com/news";
// Nasdaq's share screener, for the shares listed on Nasdaq Helsinki.
const SHARES_URL = "https://api.nasdaq.com/api/nordic/screener/shares";

// Nasdaq's largest page.
const PAGE_SIZE = 200;
// Stops paging even if the API keeps returning pages, e.g. when it ignores `start`.
const MAX_PAGES = 50;
const FETCH_TIMEOUT_MS = 30_000;

// Markets of the issuers offered for companies: Nasdaq Helsinki's main list and First North.
const ISSUER_MARKETS = ["Main Market, Helsinki", "First North Finland"];
// The same markets in the share screener.
const SHARE_CATEGORIES = ["MAIN_MARKET", "FIRST_NORTH"];

export class NasdaqError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NasdaqError";
  }
}

const COMMON_PARAMS = {
  type: "json",
  globalGroup: "exchangeNotice",
  globalName: "NordicAllMarkets",
};

const announcementsSchema = z.object({
  count: z.number().int(),
  results: z.object({
    item: z.array(
      z.object({
        disclosureId: z.number().int(),
        headline: z.string(),
        language: z.string(),
        languages: z.array(z.string()),
        categoryId: z.number().int(),
        messageUrl: z.string(),
        published: z.string(),
        attachment: z
          .array(z.object({ fileName: z.string(), attachmentUrl: z.string() }))
          .optional()
          .default([]),
      }),
    ),
  }),
});

export type NasdaqAnnouncement = {
  id: number;
  headline: string;
  language: string;
  // All languages of the release on Nasdaq. Some companies publish each language as a release of
  // its own, which then has only one language.
  languages: string[];
  categoryId: number;
  messageUrl: string;
  publishedAt: Date;
  attachments: { url: string; name: string }[];
};

// The issuer's announcements published at or after `since`, newest first. Nasdaq publishes most
// releases in Finnish and English; each release is returned once, in `language` when it has that
// version, else in its other language.
export async function fetchAnnouncements({
  issuer,
  language,
  since,
}: {
  issuer: string;
  language: "fi" | "en";
  since: Date;
}): Promise<NasdaqAnnouncement[]> {
  const announcements: NasdaqAnnouncement[] = [];
  // Pages are always newest first: Nasdaq ignores the date range and the sort direction.
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      ...COMMON_PARAMS,
      showAttachments: "true",
      countResults: "true",
      company: issuer,
      displayLanguage: language,
      timeZone: "UTC",
      dateMask: "yyyy-MM-dd'T'HH:mm:ss'Z'",
      limit: String(PAGE_SIZE),
      start: String(page * PAGE_SIZE),
      dir: "DESC",
    });
    const parsed = announcementsSchema.safeParse(await getJson(`${API_URL}/query.action?${params}`));
    if (!parsed.success) throw new NasdaqError(`Unexpected Nasdaq response: ${parsed.error.message}`);

    const items = parsed.data.results.item.map((item) => ({
      id: item.disclosureId,
      headline: item.headline.trim(),
      language: item.language,
      languages: item.languages,
      categoryId: item.categoryId,
      messageUrl: item.messageUrl,
      publishedAt: new Date(item.published),
      attachments: item.attachment.map((attachment) => ({
        url: attachment.attachmentUrl,
        name: attachment.fileName,
      })),
    }));
    if (items.some((item) => Number.isNaN(item.publishedAt.getTime()))) {
      throw new NasdaqError("Unexpected Nasdaq response: invalid publish time");
    }
    announcements.push(...items.filter((item) => item.publishedAt >= since));

    const reachedSince = items.some((item) => item.publishedAt < since);
    if (reachedSince || items.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= parsed.data.count) {
      return announcements;
    }
  }
  return announcements;
}

// Text of the release on its Nasdaq page, starting with the release line when it has one.
export async function fetchReleaseText(messageUrl: string): Promise<string> {
  const url = new URL(messageUrl);
  // Only Nasdaq's own release pages, as the URL comes from the API.
  if (url.protocol !== "https:" || url.hostname !== "view.news.eu.nasdaq.com") {
    throw new NasdaqError(`Unexpected release URL: ${messageUrl}`);
  }
  const response = await request(url.href);
  const body = elementContent(await response.text(), "view-body");
  if (body === undefined) throw new NasdaqError(`No release text on ${messageUrl}`);
  return htmlToText(body);
}

const issuersSchema = z.object({ facts: z.array(z.object({ id: z.string() })) });

// Names of the issuers on Nasdaq Helsinki and First North Finland, alphabetically. Cached for a
// week (refreshed in the background when used after that): the list changes only when companies
// are listed or delisted.
export async function fetchIssuers(): Promise<string[]> {
  "use cache";
  cacheLife("weeks");

  const lists = await Promise.all(
    ISSUER_MARKETS.map(async (market) => {
      const params = new URLSearchParams({
        ...COMMON_PARAMS,
        resultType: "company",
        displayLanguage: "en",
        market,
      });
      const parsed = issuersSchema.safeParse(await getJson(`${API_URL}/metadata.action?${params}`));
      if (!parsed.success) throw new NasdaqError(`Unexpected Nasdaq response: ${parsed.error.message}`);
      return parsed.data.facts.map((fact) => fact.id.trim());
    }),
  );
  return [...new Set(lists.flat())].filter(Boolean).sort((a, b) => a.localeCompare(b, "fi"));
}

const sharesSchema = z.object({
  data: z.object({
    instrumentListing: z.object({
      rows: z.array(z.object({ symbol: z.string(), fullName: z.string() })),
    }),
  }),
});

// A share listed on Nasdaq Helsinki: its trading code (e.g. "WRT1V") and name (e.g.
// "Wärtsilä Oyj Abp", with the share class for companies that have several, e.g. "Sampo Oyj A").
export type NasdaqShare = { ticker: string; name: string };

// The shares on Nasdaq Helsinki and First North Finland, alphabetically. Cached for a week, like the
// issuers.
export async function fetchShares(): Promise<NasdaqShare[]> {
  "use cache";
  cacheLife("weeks");

  const lists = await Promise.all(
    SHARE_CATEGORIES.map(async (category) => {
      const params = new URLSearchParams({ category, market: "HEL", tableonly: "true" });
      const parsed = sharesSchema.safeParse(await getJson(`${SHARES_URL}?${params}`));
      if (!parsed.success) throw new NasdaqError(`Unexpected Nasdaq response: ${parsed.error.message}`);
      return parsed.data.data.instrumentListing.rows.map((row) => ({
        ticker: row.symbol.trim(),
        name: row.fullName.trim(),
      }));
    }),
  );
  return lists
    .flat()
    .filter((share) => share.ticker && share.name)
    .sort((a, b) => a.name.localeCompare(b.name, "fi"));
}

async function request(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Nasdaq refuses requests without a browser-like user agent.
      headers: { "user-agent": "Mozilla/5.0 (compatible; Stolysis/1.0)", accept: "application/json, text/html" },
    });
  } catch (error) {
    throw new NasdaqError(`Nasdaq request failed: ${error}`);
  }
  if (!response.ok) throw new NasdaqError(`Nasdaq request failed: ${response.status} ${url}`);
  return response;
}

async function getJson(url: string): Promise<unknown> {
  const response = await request(url);
  try {
    return await response.json();
  } catch (error) {
    throw new NasdaqError(`Unexpected Nasdaq response: ${error}`);
  }
}

// Inner HTML of the <div> with the given id, including the <div>s nested in it.
function elementContent(html: string, id: string): string | undefined {
  const open = new RegExp(`<div\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>`, "i").exec(html);
  if (!open) return undefined;
  const start = open.index + open[0].length;
  const tags = /<(\/?)div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  return undefined;
}
