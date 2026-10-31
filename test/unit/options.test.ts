import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGES } from "../../src/i18n.ts";
import { xTheme } from "../../src/note.ts";
import { EchoGuard, previewModel, SAMPLE_LINK, tryView } from "../../src/options/model.ts";
import { DEFAULT_SETTINGS, normalizeSettings, restoreDefaults, sameSettings } from "../../src/settings.ts";
import { readFileSync } from "node:fs";

test("both languages have the same message keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.zh).sort(), Object.keys(MESSAGES.en).sort());
});

test("every key the options page uses exists", () => {
  const html = readFileSync(new URL("../../src/options/options.html", import.meta.url), "utf8");
  const keys = new Set([...html.matchAll(/\{\{(\w+)\}\}|data-i18n(?:-placeholder)?="(\w+)"/g)].map((m) => m[1] ?? m[2]));
  for (const k of keys) assert.ok(k && k in MESSAGES.en, `missing message ${k}`);
});

test("normalizeSettings fills defaults and keeps what is valid", () => {
  assert.deepEqual(normalizeSettings({ locale: "zh" }), { ...DEFAULT_SETTINGS, locale: "zh" });
  assert.deepEqual(normalizeSettings({ enabled: false, notify: false, locale: "en", extra: 1 }), { enabled: false, notify: false, locale: "en", version: 1 });
  assert.ok(["en", "zh"].includes(normalizeSettings({ locale: "fr" }).locale));
  assert.equal(normalizeSettings(null).enabled, true);
});

test("restoreDefaults keeps the language", () => {
  const s = restoreDefaults({ enabled: false, notify: false, locale: "zh", version: 1 });
  assert.ok(sameSettings(s, { ...DEFAULT_SETTINGS, locale: "zh" }));
});

test("preview: on cleans the sample, off shows it unchanged", () => {
  const on = previewModel({ enabled: true, notify: true, locale: "en" });
  assert.equal(on.keep + on.cut, SAMPLE_LINK);
  assert.equal(on.result, "https://x.com/jack/status/20");
  assert.equal(on.dimmed, false);
  assert.equal(on.showNote, true);
  const off = previewModel({ enabled: false, notify: true, locale: "zh" });
  assert.equal(off.result, SAMPLE_LINK);
  assert.equal(off.dimmed, true);
  assert.equal(off.showNote, false);
  assert.equal(off.badge, MESSAGES.zh.previewOff);
  assert.equal(previewModel({ enabled: true, notify: false, locale: "en" }).showNote, false);
});

test("tryView", () => {
  assert.equal(tryView("", "en").kind, "idle");
  assert.deepEqual(tryView("https://x.com/a?s=20", "en"), { kind: "clean", keep: "https://x.com/a", cut: "?s=20" });
  assert.equal(tryView("https://x.com/a", "zh").kind, "noQuery");
  assert.equal(tryView("https://example.com/?a", "en").kind, "notX");
});

test("EchoGuard drops our own writes and older ones", () => {
  const g = new EchoGuard();
  const a = { ...DEFAULT_SETTINGS, notify: false };
  const b = { ...DEFAULT_SETTINGS, enabled: false };
  g.expect(a);
  g.expect(b);
  assert.equal(g.take(b), true);
  assert.equal(g.take(a), false);
});

test("xTheme tells x.com's three themes apart", () => {
  assert.equal(xTheme("rgb(255, 255, 255)"), "light");
  assert.equal(xTheme("rgb(21, 32, 43)"), "dim");
  assert.equal(xTheme("rgb(0, 0, 0)"), "dark");
  assert.equal(xTheme("rgba(0, 0, 0, 0)"), "light");
  assert.equal(xTheme(""), "light");
});
