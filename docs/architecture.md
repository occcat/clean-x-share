# Architecture

How Clean X Share turns `https://x.com/user/status/1?s=20` into `https://x.com/user/status/1` on the clipboard, and where each part lives.

## How X copies a link

X's **Share → Copy link** and **··· → Copy link to profile** don't use the Clipboard API. They:

1. put the link in a hidden `<span>` (`opacity: 0; position: absolute`) at the end of `<body>`,
2. select the span's text,
3. call `document.execCommand("copy")`, which fires a `copy` event on the page,
4. remove the span and show "Copied to clipboard".

The extension rewrites the clipboard during step 3. It never reads what is already on the clipboard.

## Parts

```
x.com tab
├── bridge.js   (MAIN world, document_start)
│     wraps navigator.clipboard.writeText
└── content.js  (ISOLATED world, document_start)
      copy listener · note on the page · settings

options.html / options.js   settings page, opened from the toolbar icon
background.js               opens the settings page when the icon is clicked
chrome.storage.local        { settings: { enabled, notify, locale, version } }
```

### `src/clean.ts`: the rule

`checkLink(text)` decides what happens to the text being copied:

| Result | When | Clipboard gets |
| --- | --- | --- |
| `clean` | One `http(s)` link to `x.com` or `twitter.com` (with or without `www.` or `mobile.`) that has a `?` before any `#` | Everything before the first `?` |
| `noQuery` | Same kind of link, but no `?` part | The text as copied |
| `notX` | Anything else: other hosts, look-alike hosts such as `x.com.evil.com`, several words, plain text | The text as copied |

A link written without a scheme (`x.com/a?s=20`) counts too, and keeps its own spelling. This module has no DOM access, so `node --test` covers it directly.

### `src/content.ts`: the copy listener

A capturing `copy` listener on `window`:

- skips the copy when cleaning is off, or when the copy comes from an `<input>`, `<textarea>` or `contenteditable` element, so text you are editing is never changed;
- runs `checkLink()` on the current selection;
- on `clean`, calls `preventDefault()` and writes the kept part with `clipboardData.setData("text/plain", …)`;
- shows the note when **Show a note after cleaning** is on.

Settings load asynchronously. Until they arrive, the listener does nothing, so a page loaded with cleaning turned off never cleans in its first moments.

### `src/bridge.ts`: the Clipboard API path

X uses `execCommand` today. If it moves to `navigator.clipboard.writeText()`, that call would bypass the `copy` event. `bridge.js` runs in the page's own JavaScript world and replaces `writeText` with a wrapper that cleans X links before passing them on.

The bridge can't read extension storage. `content.js` sets `data-clean-x-share="on"` or `"off"` on `<html>`, and the bridge reads that attribute on each call. After a cleaned `writeText()`, the bridge fires `clean-x-share:cleaned` on `window` with the original text. `content.js` checks that text again before it shows a note, because any page script can fire the same event.

### `src/note.ts`: the note

A small card at the bottom right of x.com: a check mark, "Clean link copied", the kept link, and the cut part struck through. It is drawn inside a shadow root, so x.com's styles can't reach it. Every string is set with `textContent`. `xTheme()` reads `<body>`'s background colour to match X's **Default**, **Dim** and **Lights out** themes. The settings page uses the same element and CSS for its preview.

### `src/options/`: the settings page

- `options.html` holds `{{key}}` placeholders. `build.mjs` fills them with the English strings so the page has text before its script runs. `data-i18n` and `data-i18n-placeholder` attributes let the page re-word itself in the chosen language.
- `options.ts` saves each change to `chrome.storage.local` as soon as it happens and shows a toast. **Restore defaults** keeps the language and offers **Undo**. An `EchoGuard` drops storage events caused by this page's own writes, so a stale echo can't flip a switch back.
- `model.ts` holds the DOM-free parts (preview model, "Try a link" result, `EchoGuard`), which the unit tests cover.

Settings changes reach open x.com tabs through `chrome.storage.onChanged`, with no reload needed.

### `src/i18n.ts`: words

English and Simplified Chinese strings for the settings page and the note. The language defaults to the browser's UI language and can be switched on the settings page. The extension's name and description in `chrome://extensions` come from `src/_locales/*/messages.json`.

## Build

`build.mjs` uses esbuild to bundle the four entry points (`content`, `bridge`, `background`, `options`) as IIFEs for Chrome 120. It then copies `manifest.json`, `options.css`, `icons/` and `_locales/` into `dist/` and writes `options.html` with the English strings filled in. `dist/` is the folder Chrome loads, and it is not committed.

`scripts/icons.py` draws `icons/*.png` with the Python standard library only.

## Tests

| Command | What it covers |
| --- | --- |
| `npm test` | `test/unit/`: the link rule, settings normalisation, both languages having the same keys, every key the settings page uses, the preview model, theme detection |
| `npm run test:e2e` | `test/e2e/run.mjs`: loads `dist/` into headless Chrome for Testing, maps `x.com` to a local HTTPS page that copies the same way X does, and reads the clipboard after each copy. It covers post and profile links, other text, text boxes, `writeText()`, the three themes, the on/off switches, storage, restore and undo, "Try a link", and the language switch. |
| `npm run screenshots` | The same run, also writing the README images to `docs/screenshots/` |

Headless Chrome uses its own in-memory clipboard. The e2e run compares it with the system clipboard first and stops if they match, so it never overwrites yours.

Branded Google Chrome ignores `--load-extension`, so the e2e run uses Playwright's Chrome for Testing from `~/Library/Caches/ms-playwright`. Set `CHROME=/path/to/chrome` to use another build.

## When X changes

If cleaning stops working after an X update, check how X copies now. In DevTools on x.com, replace `document.execCommand` and `navigator.clipboard.writeText` with functions that log their arguments and `getSelection()`, then click Copy link:

- If the `copy` event still fires and the selection is the link, the rule in `clean.ts` is the place to look.
- If X calls `writeText()`, the bridge should already handle it.
- If X uses `navigator.clipboard.write()` with a `ClipboardItem`, the bridge needs a wrapper for `write()` as well.

Update the local page in `test/e2e/run.mjs` to copy the new way before you change the extension.
