// The options page: two switches, a live preview of the clipboard and the note, and a box to try a link in.
import { checkLink } from "../clean.ts";
import { applyI18n, detectLocale, t, tf, type Locale } from "../i18n.ts";
import { NOTE_CSS, noteElement } from "../note.ts";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, onSettingsChange, restoreDefaults, sameSettings, saveSettings, type Settings } from "../settings.ts";
import { EchoGuard, previewModel, tryView } from "./model.ts";

const TOAST_MS = 1600;

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const ui = {
  locales: Array.from(document.querySelectorAll<HTMLInputElement>('input[name="locale"]')),
  enabled: $<HTMLInputElement>("#enabled"),
  notify: $<HTMLInputElement>("#notify"),
  notifyRow: $<HTMLElement>("#notifyRow"),
  stage: $<HTMLElement>("#stage"),
  previewKeep: $<HTMLElement>("#previewKeep"),
  previewCut: $<HTMLElement>("#previewCut"),
  previewResult: $<HTMLElement>("#previewResult"),
  previewNote: $<HTMLElement>("#previewNote"),
  previewBadge: $<HTMLElement>("#previewBadge"),
  previewCaption: $<HTMLElement>("#previewCaption"),
  tryInput: $<HTMLInputElement>("#tryInput"),
  tryCopy: $<HTMLButtonElement>("#tryCopy"),
  tryResult: $<HTMLElement>("#tryResult"),
  version: $<HTMLElement>("#version"),
  reset: $<HTMLButtonElement>("#reset"),
  undo: $<HTMLButtonElement>("#undo"),
  toast: $<HTMLElement>("#toast"),
};

/** What the form shows; saved as soon as it changes. */
let state: Settings = { ...DEFAULT_SETTINGS, locale: detectLocale() };
/** Last value this page knows is in storage, so unchanged saves are skipped. */
let stored: Settings | null = null;
/** Settings from before "Restore defaults", while Undo is offered. */
let undoTo: Settings | null = null;
let ready = false;
let toastTimer: number | null = null;
let paintedLocale: Locale | null = null;
let previewKey = "";
const echoes = new EchoGuard();
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const version = manifestVersion();

const noteShadow = ui.previewNote.attachShadow({ mode: "open" });
const noteStyle = document.createElement("style");
noteStyle.textContent = NOTE_CSS;

function manifestVersion(): string | null {
  try {
    return chrome.runtime.getManifest().version || null;
  } catch {
    return null;
  }
}

function paint(): void {
  const locale = state.locale;
  if (locale !== paintedLocale) {
    paintedLocale = locale;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = t(locale, "optionsTitle");
    applyI18n(document, locale);
    ui.version.hidden = !version;
    ui.version.textContent = version ? tf(locale, "version", { v: version }) : "";
    paintTry();
  }
  for (const r of ui.locales) r.checked = r.value === locale;
  ui.enabled.checked = state.enabled;
  ui.notify.checked = state.notify;
  ui.notify.disabled = !state.enabled;
  ui.notifyRow.classList.toggle("is-off", !state.enabled);
  if (ready) paintPreview();
}

function paintPreview(): void {
  const vm = previewModel(state);
  const theme = darkQuery.matches ? "dark" : "light";
  const key = `${state.locale}|${theme}|${vm.showNote}`;
  ui.previewKeep.textContent = vm.keep;
  ui.previewCut.textContent = vm.cut;
  ui.previewResult.textContent = vm.result;
  ui.stage.classList.toggle("is-off", vm.dimmed);
  ui.previewBadge.hidden = vm.badge === null;
  ui.previewBadge.textContent = vm.badge ?? "";
  ui.previewCaption.textContent = vm.caption;
  ui.previewCaption.hidden = !vm.caption;
  if (key === previewKey) return;
  previewKey = key;
  ui.previewNote.classList.toggle("is-hidden", !vm.showNote);
  noteShadow.replaceChildren(noteStyle, noteElement(document, { title: t(state.locale, "noteTitle"), keep: vm.keep, cut: vm.cut, theme }));
}

/** The line under the "Try a link" box, and whether Copy has a clean link to copy. */
function paintTry(): void {
  const v = tryView(ui.tryInput.value, state.locale);
  ui.tryResult.dataset.kind = v.kind;
  if (v.kind === "clean") {
    const keep = document.createElement("span");
    keep.className = "keep";
    keep.textContent = v.keep;
    const cut = document.createElement("s");
    cut.className = "cut";
    cut.textContent = v.cut;
    const code = document.createElement("code");
    code.className = "link";
    code.append(keep, cut);
    ui.tryResult.replaceChildren(code);
  } else {
    ui.tryResult.textContent = v.text;
  }
  ui.tryCopy.disabled = v.kind !== "clean";
}

function update(patch: Partial<Settings>, note = "saved"): void {
  const next = normalizeSettings({ ...state, ...patch });
  if (sameSettings(next, state)) return paint();
  hideUndo();
  state = next;
  paint();
  void flush(note);
}

async function flush(note: string): Promise<void> {
  const next = state;
  if (stored && sameSettings(next, stored)) return;
  echoes.expect(next);
  stored = next;
  try {
    await saveSettings(next);
    showToast(t(next.locale, note), "ok");
  } catch {
    stored = null;
    showToast(t(next.locale, "saveFailed"), "error");
  }
}

function showToast(text: string, kind: "ok" | "info" | "error"): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  ui.toast.dataset.kind = kind;
  // Clear first so a repeated "Saved" is still a change the live region announces. The hide timer
  // is armed only once the text is up, so a throttled timer cannot leave the toast stuck on screen.
  ui.toast.textContent = "";
  toastTimer = window.setTimeout(() => {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), TOAST_MS);
  }, 30);
}

function hideUndo(): void {
  if (!undoTo) return;
  undoTo = null;
  // Hiding the focused button would drop focus to <body>.
  if (document.activeElement === ui.undo) ui.reset.focus();
  ui.undo.hidden = true;
}

/** Storage changed. Our own writes come back here too and are dropped; anything else refills the form. */
function onStorage(next: Settings): void {
  if (echoes.take(next)) return;
  stored = next;
  if (sameSettings(next, state)) return;
  hideUndo();
  state = next;
  paint();
}

for (const r of ui.locales) {
  r.addEventListener("change", () => {
    if (r.checked && (r.value === "zh" || r.value === "en")) update({ locale: r.value });
  });
}
ui.enabled.addEventListener("change", () => update({ enabled: ui.enabled.checked }));
ui.notify.addEventListener("change", () => update({ notify: ui.notify.checked }));

ui.tryInput.addEventListener("input", paintTry);
ui.tryCopy.addEventListener("click", async () => {
  const r = checkLink(ui.tryInput.value);
  if (r.kind !== "clean") return;
  try {
    await navigator.clipboard.writeText(r.keep);
    showToast(t(state.locale, "tryCopied"), "ok");
  } catch {
    showToast(t(state.locale, "tryCopyFailed"), "error");
  }
});

ui.reset.addEventListener("click", () => {
  const next = restoreDefaults(state);
  if (sameSettings(next, state)) {
    showToast(t(state.locale, "resetNoop"), "info");
    return;
  }
  const prev = state;
  update(next, "resetDone");
  undoTo = prev;
  ui.undo.hidden = false;
});
ui.undo.addEventListener("click", () => {
  const prev = undoTo;
  if (!prev) return;
  ui.reset.focus();
  update(prev, "undone");
});

darkQuery.addEventListener("change", () => {
  if (ready) paintPreview();
});

// Word the page in the browser language while storage answers; the preview waits for real settings.
paint();
void loadSettings().then((s) => {
  state = s;
  stored = s;
  ready = true;
  paint();
  onSettingsChange(onStorage);
});
