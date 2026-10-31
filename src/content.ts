/**
 * On x.com: when a copy is a single x.com link with a ? part, put the link without it on the
 * clipboard, and show a short note. Copies from input boxes and the post editor are left alone.
 */
import { CLEAN_ATTR, CLEANED_EVENT } from "./bridge-protocol.ts";
import { checkLink } from "./clean.ts";
import { t } from "./i18n.ts";
import { NOTE_CSS, noteElement, xTheme } from "./note.ts";
import { loadSettings, onSettingsChange, type Settings } from "./settings.ts";

const NOTE_MS = 2000;
const HOST_ID = "clean-x-share-note";
const HOST_CSS = `
:host {
  all: initial;
  position: fixed;
  right: 20px;
  /* Above the Messages drawer on desktop and the tab bar on narrow screens. */
  bottom: 80px;
  max-width: calc(100vw - 40px);
  z-index: 2147483647;
  pointer-events: none;
}
.note {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.18s, transform 0.18s;
}
.note.show {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .note {
    transition: none;
  }
}
`;

/** Null until storage answers, so a switched-off extension never cleans in the first moments of a page. */
let settings: Settings | null = null;
let shadow: ShadowRoot | null = null;
let live: HTMLElement | null = null;
let hideTimer: number | null = null;

function apply(next: Settings): void {
  settings = next;
  document.documentElement?.setAttribute(CLEAN_ATTR, next.enabled ? "on" : "off");
}

function inEditable(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return false;
  if (el.closest("input, textarea")) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** The host and its live region are made once and kept, so screen readers announce each note. */
function noteRoot(): { shadow: ShadowRoot; live: HTMLElement } {
  if (!shadow || !live || !shadow.host.isConnected) {
    const host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = NOTE_CSS + HOST_CSS;
    live = document.createElement("div");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    shadow.append(style, live);
    (document.body ?? document.documentElement).appendChild(host);
  }
  return { shadow, live };
}

function showNote(settings: Settings, keep: string, cut: string): void {
  if (!settings.notify) return;
  const { live: region } = noteRoot();
  const theme = xTheme(document.body ? getComputedStyle(document.body).backgroundColor : "");
  const note = noteElement(document, { title: t(settings.locale, "noteTitle"), keep, cut, theme });
  region.replaceChildren(note);
  // One frame at opacity 0 first, so the note slides in.
  requestAnimationFrame(() => requestAnimationFrame(() => note.classList.add("show")));
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    note.classList.remove("show");
    hideTimer = window.setTimeout(() => region.replaceChildren(), 250);
  }, NOTE_MS);
}

function onCopy(e: ClipboardEvent): void {
  if (!settings?.enabled || !e.clipboardData || inEditable(e.target)) return;
  const r = checkLink(String(window.getSelection() ?? ""));
  if (r.kind !== "clean") return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", r.keep);
  showNote(settings, r.keep, r.cut);
}

/** The bridge cleaned a writeText() call. Checked again here: any page script can fire this event. */
function onBridge(e: Event): void {
  const detail: unknown = (e as CustomEvent).detail;
  if (!settings?.enabled || typeof detail !== "string") return;
  const r = checkLink(detail);
  if (r.kind === "clean") showNote(settings, r.keep, r.cut);
}

window.addEventListener("copy", onCopy, true);
window.addEventListener(CLEANED_EVENT, onBridge);
void loadSettings().then(apply);
onSettingsChange(apply);
