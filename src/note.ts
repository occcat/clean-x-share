/**
 * The note x.com shows after a cleaned copy, and the options page's preview of it. Both draw it in
 * a shadow root with NOTE_CSS, so x.com's stylesheets never reach it.
 */
import { displayLink } from "./clean.ts";

/** x.com's three display themes: Default, Dim and Lights out. */
export type NoteTheme = "light" | "dim" | "dark";

/** Which x.com theme a body background colour ("rgb(21, 32, 43)") belongs to. Unreadable colours count as light. */
export function xTheme(color: string): NoteTheme {
  const m = color.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (!m) return "light";
  if (m[4] !== undefined && Number(m[4]) === 0) return "light";
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luma >= 0.5) return "light";
  return Math.max(r, g, b) < 12 ? "dark" : "dim";
}

/** Colours taken from x.com's own surfaces in each theme. */
export const NOTE_CSS = `
.note {
  --bg: #ffffff;
  --fg: #0f1419;
  --muted: #536471;
  --line: #eff3f4;
  --ok: #00ba7c;
  --cut: #8b98a5;
  --shadow: 0 0 15px rgba(101, 119, 134, 0.2), 0 0 3px 1px rgba(101, 119, 134, 0.15);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
  max-width: 360px;
  padding: 10px 14px 11px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow);
  font: 13px/1.4 TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  text-align: left;
}
.note[data-theme="dim"] {
  --bg: #15202b;
  --fg: #f7f9f9;
  --muted: #8b98a5;
  --line: #38444d;
  --cut: #6e7d8a;
  --shadow: 0 0 15px rgba(136, 153, 166, 0.2), 0 0 3px 1px rgba(136, 153, 166, 0.15);
}
.note[data-theme="dark"] {
  --bg: #000000;
  --fg: #e7e9ea;
  --muted: #71767b;
  --line: #2f3336;
  --cut: #5c6166;
  --shadow: 0 0 15px rgba(255, 255, 255, 0.2), 0 0 3px 1px rgba(255, 255, 255, 0.15);
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.check {
  display: block;
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--ok);
}
.check path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.link {
  display: flex;
  min-width: 0;
  font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
}
.keep {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--fg);
}
.cut {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--cut);
  text-decoration: line-through;
}
`;

const SVG = "http://www.w3.org/2000/svg";

function checkIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", "check");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG, "path");
  path.setAttribute("d", "M3 8.5 6.5 12 13 4.5");
  svg.appendChild(path);
  return svg;
}

export type NoteData = { title: string; keep: string; cut: string; theme: NoteTheme };

/** The note's markup. Every string goes in as text, never as HTML. */
export function noteElement(doc: Document, d: NoteData): HTMLElement {
  const note = doc.createElement("div");
  note.className = "note";
  note.dataset.theme = d.theme;
  const head = doc.createElement("div");
  head.className = "head";
  const title = doc.createElement("span");
  title.textContent = d.title;
  head.append(checkIcon(doc), title);
  const link = doc.createElement("div");
  link.className = "link";
  const keep = doc.createElement("span");
  keep.className = "keep";
  keep.textContent = displayLink(d.keep);
  const cut = doc.createElement("span");
  cut.className = "cut";
  cut.textContent = d.cut;
  link.append(keep, cut);
  note.append(head, link);
  return note;
}
