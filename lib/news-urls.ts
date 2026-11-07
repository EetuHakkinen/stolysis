// Shared by the add news dialog and the server action.

// Each URL is read with AI, so limit how many are processed at once.
export const MAX_NEWS_URLS = 20;

// URLs entered one per line (or separated by spaces), without duplicates.
export function parseNewsUrls(text: string): string[] {
  return [...new Set(text.split(/\s+/).filter(Boolean))];
}
