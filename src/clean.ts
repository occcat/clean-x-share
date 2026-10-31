/** What Copy link on x.com puts on the clipboard, minus the ? and everything after it. DOM-free, so node --test covers it. */

/** x.com and twitter.com, with or without www. or mobile. */
const X_HOST = /^(?:(?:www|mobile)\.)?(?:x|twitter)\.com$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * - clean: an X link with a ? part; `keep` is everything before the ?, `cut` the ? and the rest.
 * - noQuery: an X link with nothing to cut.
 * - notX: not a single X link (other host, several words, not a URL).
 */
export type LinkCheck = { kind: "clean"; keep: string; cut: string } | { kind: "noQuery" } | { kind: "notX" };

export function checkLink(text: string): LinkCheck {
  const s = text.trim();
  if (!s || /\s/.test(s)) return { kind: "notX" };
  let url: URL;
  try {
    // A link typed or pasted as "x.com/…" still counts; it keeps its own spelling below.
    url = new URL(HAS_SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return { kind: "notX" };
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || !X_HOST.test(url.hostname)) return { kind: "notX" };
  const q = s.indexOf("?");
  const hash = s.indexOf("#");
  // A ? inside the #fragment is part of the fragment, not a query.
  if (q < 0 || (hash >= 0 && hash < q)) return { kind: "noQuery" };
  return { kind: "clean", keep: s.slice(0, q), cut: s.slice(q) };
}

/** The link without its ? part, or null when `text` is not an X link that has one. */
export function cleanXLink(text: string): string | null {
  const r = checkLink(text);
  return r.kind === "clean" ? r.keep : null;
}

/** A link as the note shows it: no scheme. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}
