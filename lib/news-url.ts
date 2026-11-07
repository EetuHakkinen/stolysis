import "server-only";
import { z } from "zod";
import { helsinkiTime } from "@/lib/helsinki-time";
import { decodeEntities, htmlToText, isDocumentName, safeDecode } from "@/lib/news-email";
import { saveRelease, type SaveNewsResult } from "@/lib/news";
import { structuredCompletion } from "@/lib/openrouter";

// Stock exchange releases added by URL: a web page with the release, or a direct link to a
// PDF report. AI reads the page (or PDF) into the same parts an email has, and the release is
// then saved like news received by email.

const FETCH_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
// Keeps the prompt within the model's context on huge pages.
const MAX_PAGE_TEXT_LENGTH = 100_000;
const MAX_PAGE_LINKS = 500;

export type SaveNewsUrlResult =
  | SaveNewsResult
  | { saved: false; reason: "fetchFailed" | "tooLarge" | "unsupportedContent" | "notRelease" };

export async function saveNewsFromUrl(url: string): Promise<SaveNewsUrlResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
        // Some sites refuse requests without a browser-like user agent.
        "user-agent": "Mozilla/5.0 (compatible; Stolysis/1.0)",
      },
    });
  } catch (error) {
    console.warn("Fetching news URL failed", { url, error });
    return { saved: false, reason: "fetchFailed" };
  }
  if (!response.ok) return { saved: false, reason: "fetchFailed" };

  const contentType = response.headers.get("content-type") ?? "";
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > MAX_PDF_BYTES) return { saved: false, reason: "tooLarge" };

  const bytes = Buffer.from(await response.arrayBuffer());
  // Redirects change the address that relative links and the attachment resolve against.
  const finalUrl = response.url || url;

  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    if (bytes.length > MAX_PDF_BYTES) return { saved: false, reason: "tooLarge" };
    return savePdfRelease({ url: finalUrl, bytes, contentDisposition: response.headers.get("content-disposition") });
  }
  if (/html/i.test(contentType)) {
    if (bytes.length > MAX_HTML_BYTES) return { saved: false, reason: "tooLarge" };
    return savePageRelease({ url: finalUrl, html: decode(bytes, contentType) });
  }
  return { saved: false, reason: "unsupportedContent" };
}

const RELEASE_TIME_DESCRIPTION =
  'Release date and time in Finnish local time as "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" when only the date is printed), or an empty string when not printed';

const pageSchema = z.object({
  isRelease: z.boolean().describe("Whether the page is a company release or news article"),
  title: z.string().describe("Title of the release"),
  text: z.string().describe("Full text of the release, verbatim"),
  releaseTime: z.string().describe(RELEASE_TIME_DESCRIPTION),
  attachments: z.array(z.number().int()).describe("Numbers of the links that are attachments of the release"),
});

const PAGE_INSTRUCTIONS = `You read a web page that should contain a stock exchange release or other news of a listed company, and return its parts.

- title: the release's own title (not the site name).
- text: the full text of the release, verbatim, as plain text with paragraph breaks. Start with the release line (company name, release type, date and time, e.g. "Yhtiö Oyj, pörssitiedote 7.11.2026 klo 9.00") when the page has one. Leave out site navigation, menus, cookie notices, share buttons and lists of other news.
- releaseTime: when the release was published, only if printed on the page.
- attachments: the numbers of the links (from the numbered link list) to documents attached to this release, such as PDF reports or presentations. Leave out links to other releases and site pages.
- isRelease: false if the page has no release or news article (for example an error page, a login page or a list of releases).`;

async function savePageRelease({ url, html }: { url: string; html: string }): Promise<SaveNewsUrlResult> {
  const links = findPageLinks(html, url).slice(0, MAX_PAGE_LINKS);
  const page = await structuredCompletion({
    schemaName: "news_page",
    schema: pageSchema,
    messages: [
      { role: "system", content: PAGE_INSTRUCTIONS },
      {
        role: "user",
        content: [
          `URL: ${url}`,
          `Page text:\n${htmlToText(html).slice(0, MAX_PAGE_TEXT_LENGTH)}`,
          `Links:\n${links.map((link, i) => `${i + 1}. ${link.label} — ${link.url}`).join("\n")}`,
        ].join("\n\n"),
      },
    ],
  });
  if (!page.isRelease) return { saved: false, reason: "notRelease" };

  // Only links that are on the page: the model picks them by number, never writes URLs itself.
  const attachments = [...new Set(page.attachments)]
    .map((number) => links[number - 1])
    .filter((link) => link !== undefined)
    .map(({ url, label }) => ({ url, name: attachmentName(url, label) }));

  return saveRelease({
    title: page.title,
    description: page.text.trim(),
    fallbackReleasedAt: parseLocalDateTime(page.releaseTime),
    attachments,
  });
}

const pdfSchema = z.object({
  isRelease: z.boolean().describe("Whether the document is a company report or release"),
  title: z.string().describe("Title of the report"),
  text: z.string().describe("Opening section of the report, verbatim"),
  releaseTime: z.string().describe(RELEASE_TIME_DESCRIPTION),
});

const PDF_INSTRUCTIONS = `You read a PDF that should be a report or stock exchange release of a listed company (for example an interim report or a financial statements release), and return its parts.

- title: the report's title as printed, including the company name and the period, e.g. "Yhtiö Oyj:n osavuosikatsaus 1.1.–30.9.2026".
- text: the opening section of the report verbatim, as plain text with paragraph breaks: the release line (company name, release type, date and time, e.g. "Yhtiö Oyj, osavuosikatsaus 29.10.2026 klo 9.00") if printed, followed by the summary or highlights and the CEO's review if it follows them. At most about 1500 words; leave out tables.
- releaseTime: when the report was published, only if printed in the report.
- isRelease: false if the document is not a company report or release.`;

async function savePdfRelease({
  url,
  bytes,
  contentDisposition,
}: {
  url: string;
  bytes: Buffer;
  contentDisposition: string | null;
}): Promise<SaveNewsUrlResult> {
  const fileName = pdfFileName(url, contentDisposition);
  const report = await structuredCompletion({
    schemaName: "news_pdf",
    schema: pdfSchema,
    messages: [
      { role: "system", content: PDF_INSTRUCTIONS },
      {
        role: "user",
        content: [
          {
            type: "file",
            file: {
              filename: fileName ?? "report.pdf",
              file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
            },
          },
        ],
      },
    ],
  });
  if (!report.isRelease) return { saved: false, reason: "notRelease" };

  return saveRelease({
    title: report.title,
    description: report.text.trim(),
    fallbackReleasedAt: parseLocalDateTime(report.releaseTime),
    // The ".pdf" name lets result extraction find the report.
    attachments: [{ url, name: fileName ?? `${report.title.trim() || "report"}.pdf` }],
  });
}

// Body text in the charset the response declares, UTF-8 by default.
function decode(bytes: Buffer, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// Absolute http(s) links of the page with their labels, without duplicates. Links are any
// elements with an href, not just <a>: pages also use custom elements, e.g. Nasdaq's
// <nef-link href="…">Report.pdf</nef-link>. The label is the element's text, or its aria-label.
function findPageLinks(html: string, baseUrl: string): { url: string; label: string }[] {
  const lowerHtml = html.toLowerCase();
  const links = new Map<string, string>();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bhref\s*=[^>]*)>/gi)) {
    // Elements without a closing tag (e.g. <link> to a stylesheet) aren't links on the page.
    const contentStart = match.index + match[0].length;
    const contentEnd = lowerHtml.indexOf(`</${match[1].toLowerCase()}`, contentStart);
    if (contentEnd === -1) continue;

    const attributes = match[2];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    const ariaLabel = /\baria-label\s*=\s*["']([^"']*)["']/i.exec(attributes)?.[1];
    const label =
      htmlToText(html.slice(contentStart, contentEnd)).replace(/\s+/g, " ").trim() ||
      decodeEntities(ariaLabel ?? "").trim();
    if (!links.get(url.href)) links.set(url.href, label);
  }
  return [...links].map(([url, label]) => ({ url, label }));
}

// A link's label when it's a document file name, like in emails, else the URL's file name when
// that is one, else the label.
function attachmentName(url: string, label: string): string | undefined {
  if (isDocumentName(label)) return label;
  const fileName = urlFileName(url);
  if (fileName && isDocumentName(fileName)) return fileName;
  return label || undefined;
}

// File name from the Content-Disposition header or the URL, when it's a PDF file name.
function pdfFileName(url: string, contentDisposition: string | null): string | undefined {
  const disposition = contentDisposition ?? "";
  const encoded = /filename\*\s*=\s*[\w-]+''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)?.[1];
  return [encoded && safeDecode(encoded), plain, urlFileName(url)]
    .map((name) => name?.trim())
    .find((name) => name?.toLowerCase().endsWith(".pdf"));
}

function urlFileName(url: string): string | undefined {
  return safeDecode(new URL(url).pathname.split("/").pop() ?? "") || undefined;
}

// "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" in Finnish local time.
function parseLocalDateTime(text: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(text.trim());
  if (!match) return undefined;
  const [year, month, day, hour, minute] = [
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  ];
  const check = new Date(Date.UTC(year, month, day));
  if (check.getUTCMonth() !== month || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    return undefined;
  }
  return helsinkiTime(year, month, day, hour, minute);
}
