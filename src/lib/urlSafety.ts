// Minimal href safety check for user-entered external links (sponsor
// websites). Restricts to http/https so a stored javascript:, data:, or
// other unsafe scheme can never end up as a clickable href.
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
