/** DOM-free logic behind the options page, kept apart from options.ts so node --test can cover it. */
import { checkLink, type LinkCheck } from "../clean.ts";
import type { Locale } from "../i18n.ts";
import { t } from "../i18n.ts";
import type { Settings } from "../settings.ts";

/** The link the preview cleans. */
export const SAMPLE_LINK = "https://x.com/jack/status/20?s=46&t=Qx3Lr8mV0aKp2TfYc1HwBg";

export type PreviewModel = {
  /** The link X copies, split where the ? starts. */
  keep: string;
  cut: string;
  /** What lands on the clipboard. */
  result: string;
  /** Cleaning is off: the preview is greyed out and `badge` says so. */
  dimmed: boolean;
  badge: string | null;
  showNote: boolean;
  caption: string;
};

export function previewModel(s: Pick<Settings, "enabled" | "notify" | "locale">): PreviewModel {
  const r = checkLink(SAMPLE_LINK);
  const keep = r.kind === "clean" ? r.keep : SAMPLE_LINK;
  const cut = r.kind === "clean" ? r.cut : "";
  return {
    keep,
    cut,
    result: s.enabled ? keep : SAMPLE_LINK,
    dimmed: !s.enabled,
    badge: s.enabled ? null : t(s.locale, "previewOff"),
    showNote: s.enabled && s.notify,
    caption: s.enabled ? t(s.locale, s.notify ? "previewNoteOn" : "previewNoteOff") : "",
  };
}

/** The line under the "Try a link" box: words only, or the link split where it is cut. */
export type TryView = { kind: "idle" | "noQuery" | "notX"; text: string } | { kind: "clean"; keep: string; cut: string };

export function tryView(raw: string, locale: Locale): TryView {
  if (!raw.trim()) return { kind: "idle", text: t(locale, "tryIdle") };
  const r: LinkCheck = checkLink(raw);
  if (r.kind === "clean") return { kind: "clean", keep: r.keep, cut: r.cut };
  return { kind: r.kind, text: t(locale, r.kind === "noQuery" ? "tryNoQuery" : "tryNotX") };
}

function settingsKey(s: Settings): string {
  return JSON.stringify([s.enabled, s.notify, s.locale, s.version]);
}

/**
 * Tells this page's own writes apart from changes made elsewhere. storage.onChanged also fires for
 * our writes, sometimes after newer ones were queued; filling the form from those stale echoes
 * would flip a switch back.
 */
export class EchoGuard {
  private pending: string[] = [];

  /** Call right before writing `s`. */
  expect(s: Settings): void {
    this.pending.push(settingsKey(s));
    if (this.pending.length > 16) this.pending.shift();
  }

  /** True when `s` is one of our writes coming back. Forgets it and any older ones. */
  take(s: Settings): boolean {
    const i = this.pending.indexOf(settingsKey(s));
    if (i < 0) return false;
    this.pending.splice(0, i + 1);
    return true;
  }
}
