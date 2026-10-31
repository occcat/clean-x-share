/**
 * Runs in x.com's own JavaScript world. X's Copy link selects a hidden span and calls
 * document.execCommand("copy"), which content.ts handles. If X moves to the Clipboard API, its
 * writeText() calls come through here instead. The content script turns this on and off through
 * the CLEAN_ATTR attribute on <html>, and hears about each cleaned link through CLEANED_EVENT.
 */
import { CLEAN_ATTR, CLEANED_EVENT } from "./bridge-protocol.ts";
import { cleanXLink } from "./clean.ts";

const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
const original = clip?.writeText;

if (clip && typeof original === "function") {
  const writeText = function (this: Clipboard, data: string): Promise<void> {
    const on = document.documentElement.getAttribute(CLEAN_ATTR) === "on";
    const clean = on && typeof data === "string" ? cleanXLink(data) : null;
    if (clean === null) return original.call(this, data);
    return original.call(this, clean).then(() => {
      window.dispatchEvent(new CustomEvent(CLEANED_EVENT, { detail: data }));
    });
  };
  Object.defineProperty(clip, "writeText", { value: writeText, configurable: true, writable: true });
}
