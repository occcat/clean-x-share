// Development only: load dist/ into headless Chrome for Testing, point x.com at a local page that
// copies links the way X does (a hidden span, a selection and execCommand("copy")), and check
// what lands on the clipboard. Headless Chrome keeps its own in-memory clipboard; a guard below
// stops the run if it ever turns out to share the system one.
//
//   npm run build && node test/e2e/run.mjs [--shots <dir>] [--readme <dir>]
//
// --shots writes every options-page variant (light/dark × zh/en × 1280/375 px) and the note in each
// x.com theme. --readme writes the images the READMEs use: the English options page in light and
// dark, and the note in x.com's light and dark themes.
//
// CHROME overrides the browser. Branded Google Chrome ignores --load-extension, so the default is
// Playwright's Chrome for Testing.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(ROOT, "dist");
const argDir = (flag) => {
  const at = process.argv.indexOf(flag);
  return at > 0 ? resolve(process.argv[at + 1] ?? "shots") : null;
};
const SHOTS = argDir("--shots");
const README = argDir("--readme");

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), "Library/Caches/ms-playwright");
  const builds = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
  for (const b of builds) {
    for (const arch of ["chrome-mac-arm64", "chrome-mac"]) {
      const p = join(base, b, arch, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
      if (existsSync(p)) return p;
    }
  }
  throw new Error("no Chrome for Testing found; set CHROME");
}

if (!existsSync(join(DIST, "manifest.json"))) throw new Error("dist/ is missing; run npm run build first");

const work = mkdtempSync(join(tmpdir(), "cxs-e2e-"));
let chrome = null;
let server = null;
const cleanup = () => {
  try {
    chrome?.kill("SIGKILL");
  } catch {
    /* gone */
  }
  server?.close();
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* helpers may still hold the profile for a moment */
  }
};
process.once("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => process.exit(130));

// --- A stand-in for x.com ---------------------------------------------------------------------
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=x.com", "-addext", "subjectAltName=DNS:x.com,DNS:twitter.com", "-keyout", join(work, "key.pem"), "-out", join(work, "cert.pem")], { stdio: "ignore" });

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>X</title>
<style>body{margin:0;min-height:100vh;font:15px system-ui;background:var(--bg,#fff);color:#0f1419}
main{max-width:600px;margin:0 auto;padding:24px;border-inline:1px solid #8884;min-height:100vh}
article{padding:12px 0;border-bottom:1px solid #8884}</style></head>
<body><main><article><b>Jack</b> @jack · Mar 21, 2006<p>just setting up my twttr</p></article>
<textarea id="ta" rows="2" cols="60"></textarea></main>
<script>
const bg = new URLSearchParams(location.search).get("bg");
if (bg) document.body.style.setProperty("--bg", bg);
// What X's Copy link does, as seen on x.com in 2026.
window.xCopy = (text) => {
  const span = document.createElement("span");
  span.textContent = text;
  span.style.cssText = "opacity:0;position:absolute;white-space:pre-wrap;user-select:auto";
  document.body.appendChild(span);
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = document.execCommand("copy");
  sel.removeAllRanges();
  span.remove();
  return ok;
};
</script></body></html>`;

server = createServer({ key: readFileSync(join(work, "key.pem")), cert: readFileSync(join(work, "cert.pem")) }, (_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// --- Chrome -----------------------------------------------------------------------------------
const profile = join(work, "profile");
chrome = spawn(
  findChrome(),
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    `--host-resolver-rules=MAP x.com 127.0.0.1:${port}, MAP twitter.com 127.0.0.1:${port}`,
    "--ignore-certificate-errors",
    "--no-proxy-server",
    "--lang=en-US",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try {
    const p = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
    wsUrl = (await (await fetch(`http://127.0.0.1:${p}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {
    /* not up yet */
  }
}
if (!wsUrl) throw new Error("Chrome did not open a DevTools port");

// --- A small CDP client: one browser socket, flat sessions ------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => {
  ws.addEventListener("open", r, { once: true });
  ws.addEventListener("error", j, { once: true });
});
let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id !== undefined) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p?.reject(new Error(`${p.method}: ${m.error.message}`));
    else p?.resolve(m.result);
    return;
  }
  for (const w of waiters.splice(0)) (w.match(m) ? w.resolve(m.params) : waiters.push(w));
});
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method}: no reply`)), 15_000);
    pending.set(id, { method, resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
  });
}
function once(method, sessionId, ms = 15_000) {
  return new Promise((resolve, reject) => {
    const w = { match: (m) => m.method === method && m.sessionId === sessionId, resolve };
    waiters.push(w);
    setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), ms).unref();
  });
}

async function openPage() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Page.enable");
  await s("Runtime.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true });
  return {
    async goto(url) {
      const loaded = once("Page.loadEventFired", sessionId);
      await s("Page.navigate", { url });
      await loaded;
    },
    async eval(expression, userGesture = false) {
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture });
      if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async until(expression, ms = 4000) {
      const t0 = Date.now();
      for (;;) {
        const v = await this.eval(expression);
        if (v) return v;
        if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${expression}`);
        await sleep(30);
      }
    },
    async scheme(dark) {
      await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
    },
    async shot(file, width, fullPage = true) {
      await s("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: width < 600 });
      const size = await this.eval(`({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, vw: innerWidth })`);
      if (fullPage) await s("Emulation.setDeviceMetricsOverride", { width, height: size.h, deviceScaleFactor: 2, mobile: width < 600 });
      await sleep(250);
      const { data } = await s("Page.captureScreenshot", { format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
      return size;
    },
    /** PNG of one element, `pad` CSS px around it. `selector` may reach into a shadow root as "host >>> inner". */
    async shotElement(file, selector, pad = 24) {
      await s("Emulation.setDeviceMetricsOverride", { width: 1100, height: 700, deviceScaleFactor: 2, mobile: false });
      await sleep(250);
      const [host, inner] = selector.split(" >>> ");
      const box = await this.eval(`(() => {
        let el = document.querySelector(${JSON.stringify(host)});
        if (el && ${JSON.stringify(inner ?? "")}) el = el.shadowRoot.querySelector(${JSON.stringify(inner ?? "")});
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`);
      const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + pad * 2, height: box.h + pad * 2, scale: 1 };
      const { data } = await s("Page.captureScreenshot", { format: "png", clip });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
  };
}

// An unpacked extension's id: the first 32 hex digits of the SHA-256 of its absolute path, each
// digit mapped to a–p. Matched against the running service workers, since Chrome's own component
// extensions run service workers too.
const extId = [...createHash("sha256").update(realpathSync(DIST)).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
let up = false;
for (let i = 0; i < 50 && !up; i++) {
  const { targetInfos } = await send("Target.getTargets");
  up = targetInfos.some((t) => t.type === "service_worker" && t.url.startsWith(`chrome-extension://${extId}/`));
  if (!up) await sleep(100);
}
if (!up) throw new Error(`the extension did not load (expected id ${extId})`);

// --- Checks -----------------------------------------------------------------------------------
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${ok || !detail ? "" : `\n    ${detail}`}`);
  if (!ok) failed++;
}

await send("Browser.grantPermissions", { origin: "https://x.com", permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
const x = await openPage();
await x.goto("https://x.com/RedefineFX");
await x.until(`document.documentElement.getAttribute("data-clean-x-share") === "on"`).catch(async (e) => {
  console.error(await x.eval(`({ href: location.href, title: document.title, attr: document.documentElement.getAttribute("data-clean-x-share"), ext: ${JSON.stringify(extId)} })`));
  throw e;
});

const readClip = () => x.eval(`navigator.clipboard.readText()`, true);
const setClip = (text) => x.eval(`navigator.clipboard.writeText(${JSON.stringify(text)})`, true);

// Stop if this browser's clipboard is the system one: the checks below would overwrite it.
if (process.platform === "darwin") {
  const hash = (s) => createHash("sha256").update(s).digest("hex");
  const system = spawnSync("pbpaste", { encoding: "utf8" }).stdout ?? "";
  const mine = await readClip().catch(() => "");
  if (system && hash(system) === hash(mine)) throw new Error("headless Chrome shares the system clipboard here; not running");
}

const xCopy = async (text) => {
  await setClip("(before)");
  await x.eval(`document.getElementById("clean-x-share-note")?.shadowRoot.querySelector('[role="status"]').replaceChildren()`);
  const ok = await x.eval(`xCopy(${JSON.stringify(text)})`, true);
  return { ok, clip: await readClip() };
};
const noteText = () => x.eval(`document.getElementById("clean-x-share-note")?.shadowRoot.querySelector(".note")?.textContent ?? null`);

const POST = "https://x.com/RedefineFX/status/2112161593392038386?a=Sample0Share1Token2&s=20";
let r = await xCopy(POST);
check("post Copy link: clipboard keeps only what is before the ?", r.ok && r.clip === "https://x.com/RedefineFX/status/2112161593392038386", JSON.stringify(r));
const note = await noteText();
// The title follows the browser's language; the link and its cut part come after it.
check("post Copy link: the note shows the link and the cut part", !!note?.endsWith("x.com/RedefineFX/status/2112161593392038386?a=Sample0Share1Token2&s=20"), note);

r = await xCopy("https://x.com/RedefineFX?s=20");
check("profile Copy link: ?s=20 is removed", r.clip === "https://x.com/RedefineFX", JSON.stringify(r));

r = await xCopy("https://x.com/RedefineFX/status/1");
check("a link without ? is copied as is", r.clip === "https://x.com/RedefineFX/status/1", JSON.stringify(r));

r = await xCopy("https://example.com/a?b=1");
check("a link to another site is copied as is", r.clip === "https://example.com/a?b=1", JSON.stringify(r));

r = await xCopy("just setting up my twttr?");
check("ordinary text is copied as is", r.clip === "just setting up my twttr?", JSON.stringify(r));

await setClip("(before)");
await x.eval(`(() => { const ta = document.getElementById("ta"); ta.value = ${JSON.stringify(POST)}; ta.focus(); ta.select(); return document.execCommand("copy"); })()`, true);
r = { clip: await readClip() };
check("a link copied out of a text box is left alone", r.clip === POST, JSON.stringify(r));
await x.eval(`document.getElementById("ta").blur()`);

await setClip("(before)");
await x.eval(`navigator.clipboard.writeText("https://x.com/jack/status/20?s=46&t=abc")`, true);
r = { clip: await readClip() };
check("navigator.clipboard.writeText is cleaned too", r.clip === "https://x.com/jack/status/20", JSON.stringify(r));

// x.com's three themes pick the note's colours.
for (const [bg, theme] of [["rgb(255, 255, 255)", "light"], ["rgb(21, 32, 43)", "dim"], ["rgb(0, 0, 0)", "dark"]]) {
  await x.goto(`https://x.com/jack?bg=${encodeURIComponent(bg)}`);
  await x.until(`document.documentElement.getAttribute("data-clean-x-share") === "on"`);
  await xCopy("https://x.com/jack/status/20?s=46&t=Qx3Lr8mV0aKp2TfYc1HwBg");
  const got = await x.eval(`document.getElementById("clean-x-share-note")?.shadowRoot.querySelector(".note")?.dataset.theme`);
  check(`note follows x.com's ${theme} theme`, got === theme, got);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await x.until(`document.getElementById("clean-x-share-note")?.shadowRoot.querySelector(".note.show")`);
    await sleep(250);
    await x.shot(join(SHOTS, `x-note-${theme}.png`), 1100, false);
  }
}

// The options page switches cleaning off and on in every x.com tab.
const opt = await openPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.until(`document.getElementById("previewResult")?.textContent.length > 0`).catch(async (e) => {
  console.error(await opt.eval(`({ href: location.href, title: document.title, body: document.body?.innerText.slice(0, 200) })`));
  throw e;
});
await opt.eval(`document.getElementById("enabled").click()`);
await x.until(`document.documentElement.getAttribute("data-clean-x-share") === "off"`);
r = await xCopy(POST);
check("switched off: Copy link keeps the ? part", r.clip === POST, JSON.stringify(r));
await setClip("(before)");
await x.eval(`navigator.clipboard.writeText(${JSON.stringify(POST)})`, true);
r = { clip: await readClip() };
check("switched off: writeText keeps the ? part", r.clip === POST, JSON.stringify(r));
const dimmed = await opt.eval(`document.getElementById("stage").classList.contains("is-off") && document.getElementById("notify").disabled`);
check("switched off: the preview greys out and the note switch is disabled", dimmed);

await opt.eval(`document.getElementById("enabled").click()`);
await opt.eval(`document.getElementById("notify").click()`);
await x.until(`document.documentElement.getAttribute("data-clean-x-share") === "on"`);
await sleep(100);
r = await xCopy(POST);
const silent = await noteText();
check("note off: still cleaned, no note", r.clip === "https://x.com/RedefineFX/status/2112161593392038386" && silent === null, JSON.stringify({ ...r, silent }));

const stored = await opt.eval(`chrome.storage.local.get("settings").then((b) => b.settings)`);
check("settings are saved in chrome.storage.local", stored?.enabled === true && stored?.notify === false, JSON.stringify(stored));

// Restore defaults, then Undo.
await opt.eval(`document.getElementById("reset").click()`);
await opt.until(`!document.getElementById("undo").hidden && document.getElementById("notify").checked`);
await opt.eval(`document.getElementById("undo").click()`);
await opt.until(`document.getElementById("undo").hidden && !document.getElementById("notify").checked`);
check("restore defaults and undo", true);
await opt.eval(`document.getElementById("notify").click()`);

// Try a link.
await opt.eval(`(() => { const i = document.getElementById("tryInput"); i.value = "https://twitter.com/jack/status/20?s=20"; i.dispatchEvent(new Event("input")); })()`);
const tried = await opt.eval(`({ text: document.getElementById("tryResult").textContent, copy: !document.getElementById("tryCopy").disabled })`);
check("Try a link shows the cut", tried.text === "https://twitter.com/jack/status/20?s=20" && tried.copy, JSON.stringify(tried));

// Language switch rewords the page.
await opt.eval(`document.querySelector('input[name="locale"][value="zh"]').click()`);
const zh = await opt.until(`document.documentElement.lang === "zh-CN" && document.querySelector("h2#cleaningTitle").textContent`);
check("switching to 中文 rewords the page", zh === "清理", zh);

if (SHOTS) {
  await opt.eval(`(() => { const i = document.getElementById("tryInput"); i.value = ""; i.dispatchEvent(new Event("input")); })()`);
  for (const dark of [false, true]) {
    await opt.scheme(dark);
    for (const locale of ["zh", "en"]) {
      await opt.eval(`document.querySelector('input[name="locale"][value="${locale}"]').click()`);
      await sleep(150);
      for (const width of [1280, 375]) {
        const size = await opt.shot(join(SHOTS, `options-${dark ? "dark" : "light"}-${locale}-${width}.png`), width);
        check(`options ${dark ? "dark" : "light"} ${locale} ${width}px: no sideways scroll`, size.w <= size.vw, JSON.stringify(size));
      }
    }
  }
  console.log(`screenshots in ${SHOTS}`);
}

if (README) {
  mkdirSync(README, { recursive: true });
  await opt.eval(`(() => { const i = document.getElementById("tryInput"); i.value = "https://x.com/jack/status/20?s=46&t=Qx3Lr8mV0aKp2TfYc1HwBg"; i.dispatchEvent(new Event("input")); })()`);
  // English images have no suffix; the Chinese README uses the "-zh" ones.
  for (const [locale, suffix, title] of [["en", "", "Clean link copied"], ["zh", "-zh", "已复制干净链接"]]) {
    await opt.eval(`document.querySelector('input[name="locale"][value="${locale}"]').click()`);
    for (const dark of [false, true]) {
      await opt.scheme(dark);
      await sleep(150);
      await opt.shot(join(README, `options-${dark ? "dark" : "light"}${suffix}.png`), 1280);
    }
    // The note in that language, once the options page has stored it, on a bare page.
    for (const [bg, theme] of [["rgb(255, 255, 255)", "light"], ["rgb(0, 0, 0)", "dark"]]) {
      await x.goto(`https://x.com/jack?bg=${encodeURIComponent(bg)}`);
      await x.until(`document.documentElement.getAttribute("data-clean-x-share") === "on"`);
      await x.eval(`document.querySelector("main").style.visibility = "hidden"`);
      await xCopy("https://x.com/jack/status/20?s=46&t=Qx3Lr8mV0aKp2TfYc1HwBg");
      await x.until(`document.getElementById("clean-x-share-note")?.shadowRoot.querySelector(".note.show")?.textContent.startsWith(${JSON.stringify(title)})`);
      await sleep(250);
      await x.shotElement(join(README, `note-${theme}${suffix}.png`), "#clean-x-share-note >>> .note");
    }
  }
  console.log(`README images in ${README}`);
}

ws.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
