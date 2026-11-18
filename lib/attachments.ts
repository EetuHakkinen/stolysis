import "server-only";
import { htmlToText } from "@/lib/news-email";

// Downloading the documents attached to news, for reading them with AI.

export type Attachment = { url: string; name: string | null };

const MAX_FILE_BYTES = 30 * 1024 * 1024;

// Links don't always name the file (e.g. ".../Resource/Download/0f79…" labelled
// "Harvia-Oyj-Osavuosikatsaus-Q2-2026-FIN"), so at most this many are downloaded to check.
const MAX_PDF_CANDIDATES = 5;

function looksLikePdf(attachment: Attachment) {
  return [attachment.name ?? "", new URL(attachment.url).pathname].some((name) =>
    name.toLowerCase().endsWith(".pdf"),
  );
}

// The first attachment that is a PDF, as a base64 data URL. Attachments named like PDFs are
// tried first, then the rest by their content.
export async function findPdf(attachments: Attachment[]) {
  const candidates = [
    ...attachments.filter(looksLikePdf),
    ...attachments.filter((attachment) => !looksLikePdf(attachment)),
  ].slice(0, MAX_PDF_CANDIDATES);
  for (const attachment of candidates) {
    const fileData = await downloadPdf(attachment.url);
    if (fileData) return { name: attachment.name, fileData };
  }
  return undefined;
}

// The file at the URL as a base64 data URL, or undefined when it isn't a PDF.
async function downloadPdf(url: string): Promise<string | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    console.warn("Attachment download failed", { url, status: response.status });
    await response.body?.cancel();
    return undefined;
  }
  // Skip pages and images without downloading them. Servers that don't know the type send
  // octet-stream or nothing, so those are checked by content.
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !/pdf|octet-stream/.test(contentType)) {
    await response.body?.cancel();
    return undefined;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new Error(`PDF is too large: ${bytes.length} bytes`);
  return isPdf(bytes) ? pdfDataUrl(bytes) : undefined;
}

// A downloaded attachment: a PDF as a base64 data URL, or a page or text file as plain text.
// `bytes` is the size downloaded.
export type AttachmentDocument =
  | { kind: "pdf"; name: string; fileData: string; bytes: number }
  | { kind: "text"; name: string; text: string; bytes: number };

// The attachment as a document, or undefined when it can't be downloaded, is too large or is
// neither a PDF nor text (e.g. an image).
export async function downloadDocument(attachment: Attachment): Promise<AttachmentDocument | undefined> {
  const { url } = attachment;
  const name = attachment.name || new URL(url).pathname.split("/").pop() || url;
  const response = await fetch(url);
  const skip = async (reason: string, details?: object) => {
    console.warn("Attachment skipped", { url, reason, ...details });
    await response.body?.cancel();
    return undefined;
  };
  if (!response.ok) return skip("downloadFailed", { status: response.status });

  // Servers that don't know the type send octet-stream or nothing, so those are checked by content.
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const pdfOrUnknown = !contentType || /pdf|octet-stream/.test(contentType);
  const text = /^text\/|html|xml|json/.test(contentType);
  if (!pdfOrUnknown && !text) return skip("unsupportedType", { contentType });
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES) return skip("tooLarge");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) return skip("tooLarge", { bytes: bytes.length });
  if (pdfOrUnknown) {
    if (!isPdf(bytes)) return skip("notPdf", { contentType });
    return { kind: "pdf", name, fileData: pdfDataUrl(bytes), bytes: bytes.length };
  }
  const decoded = bytes.toString("utf8");
  const plain = /html|xml/.test(contentType) ? htmlToText(decoded) : decoded.trim();
  if (!plain) return skip("empty");
  return { kind: "text", name, text: plain, bytes: bytes.length };
}

function isPdf(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

function pdfDataUrl(bytes: Buffer) {
  return `data:application/pdf;base64,${bytes.toString("base64")}`;
}
