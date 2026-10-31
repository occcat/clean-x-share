- The default branch is `main`. Base branches on `main` and diff against `main` unless told otherwise.
- Edit sources under `src/`. `dist/` is build output: never edit it by hand and never commit it.
- Keep the extension's footprint as it is: only the `storage` permission, content scripts only on `x.com`, `mobile.x.com`, `twitter.com` and `mobile.twitter.com`, no network requests, no remote code. Get the user's agreement before widening any of these.
- Never read the clipboard's existing contents. Only rewrite the text of the copy in progress, and only when `checkLink()` returns `clean`.
- Never change text the user is editing. Copies from `<input>`, `<textarea>` and `contenteditable` elements stay as they are.
- Every user-facing string exists in both `en` and `zh` in `src/i18n.ts`. Manifest strings go in `src/_locales/*/messages.json`.
- When X changes how Copy link works, update the local page in `test/e2e/run.mjs` to copy the new way before changing the extension.

## Commits

Commit with a message that follows [Conventional Commits](https://www.conventionalcommits.org/), written in Chinese. Make it as detailed as possible and always multi-line, and include only a description of what changed and why.

```
<type>(<optional scope>): <中文摘要>

<中文正文：改了什么、为什么改>
```

- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- The subject is one imperative line with no trailing period.
- A blank line follows the subject, then a body of at least two lines. A subject-only commit is not allowed.
- Leave out process chatter, tool signatures, `Co-authored-by` lines for agents, secrets and machine-specific paths.
- Unrelated changes go in separate commits.

Example:

```
fix(content): 输入框里复制的链接不再被清理

用户在发帖框或搜索框里选中链接复制时，扩展也会去掉 ? 后面的内容，
改动了用户正在编辑的文字。现在 copy 事件来自 input、textarea 或
contenteditable 元素时直接跳过，只处理页面上的复制链接操作。
```

## Style Guide

- TypeScript in strict mode. Avoid `any`.
- Keep DOM-free logic in its own modules (`src/clean.ts`, `src/options/model.ts`) so `node --test` can cover it without a browser.
- Insert page text with `textContent` or `createElement`, never `innerHTML`.
- Draw anything shown on x.com inside a shadow root so the site's CSS can't reach it.
- Treat values from the page (selection text, `CustomEvent.detail`) as untrusted, and check them again with `checkLink()` before acting on them.
- Write comments for non-obvious constraints and surprising behavior, not for obvious code.
- Don't add runtime dependencies. Dev dependencies stay limited to the build and type tooling.

## Testing

- Test the real implementation. Don't copy logic into tests.
- Unit tests live in `test/unit/` and run with `node --test`.
- The e2e run must never touch the system clipboard. Keep its system-clipboard guard in place.

## Checks

Run these before committing. All must pass:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

After a change to the settings page or the note, run `npm run screenshots` and commit the updated `docs/screenshots/`.
