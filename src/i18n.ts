export type Locale = "en" | "zh";

export function detectLocale(lang?: string): Locale {
  const raw = (lang ?? detectBrowserLang()).toLowerCase();
  return raw.startsWith("zh") ? "zh" : "en";
}

function detectBrowserLang(): string {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) return chrome.i18n.getUILanguage();
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") return navigator.language || "";
  return "en";
}

const EN: Record<string, string> = {
  appName: "Clean X Share",
  optionsTitle: "Clean X Share settings",
  subtitle: "Copy link on x.com, without the ? and what follows.",
  language: "Language",

  previewTitle: "Preview",
  previewSample: "Sample link",
  previewFrom: "X copies",
  previewTo: "Clipboard gets",
  previewOff: "Off: links are copied as X gives them",
  previewNoteOn: "After each cleaned copy, this note shows at the bottom right of x.com for 2 s.",
  previewNoteOff: "No note on x.com. X still shows its own “Copied to clipboard”.",

  cleaningTitle: "Cleaning",
  enabled: "Clean links from Copy link",
  enabledHelp: "Removes the ? and everything after it, such as ?s=20 or ?t=…, before the link reaches the clipboard.",
  notify: "Show a note after cleaning",
  notifyHelp: "A small note at the bottom right of x.com with the link that was copied.",

  tryTitle: "Try a link",
  tryLabel: "Link to clean",
  tryPlaceholder: "Paste a link from X",
  tryIdle: "Paste a link to see what Copy link would put on the clipboard.",
  tryNoQuery: "This link has no ? part, so it stays as it is.",
  tryNotX: "Not an x.com or twitter.com link, so it is left alone.",
  tryCopy: "Copy",
  tryCopied: "Clean link copied",
  tryCopyFailed: "Could not copy",

  privacyTitle: "Data & privacy",
  privacyLead:
    "The extension runs only on x.com and twitter.com. When you copy, it looks only at the text being copied. If that text is a single x.com link with a ? part, the clipboard gets the link without it. It never reads what is already on your clipboard, makes no network requests and has no server.",
  srcPost: "Post link",
  srcPostDesc: "Share → Copy link",
  srcProfile: "Profile link",
  srcProfileDesc: "··· → Copy link to profile",
  srcManual: "A whole x.com link you select and copy",
  srcManualDesc: "Text in input boxes and the post editor is never changed",
  privacyStorage: "Settings are stored only in this browser (chrome.storage.local).",

  version: "Version {v}",
  reset: "Restore defaults",
  resetDone: "Defaults restored",
  resetNoop: "Already using the defaults",
  undo: "Undo",
  undone: "Previous settings restored",
  saved: "Saved",
  saveFailed: "Could not save",

  noteTitle: "Clean link copied",
};

const ZH: Record<string, string> = {
  appName: "Clean X Share",
  optionsTitle: "Clean X Share 设置",
  subtitle: "在 x.com 上复制链接时，去掉 ? 及后面的部分。",
  language: "语言",

  previewTitle: "预览",
  previewSample: "示例链接",
  previewFrom: "X 复制的",
  previewTo: "剪贴板里",
  previewOff: "已关闭：链接按 X 给的原样复制",
  previewNoteOn: "每次清理后，x.com 右下角会显示这条提示 2 秒。",
  previewNoteOff: "x.com 上不显示提示，X 自己的「已复制到剪贴板」照常出现。",

  cleaningTitle: "清理",
  enabled: "清理「复制链接」得到的链接",
  enabledHelp: "链接进入剪贴板前，去掉 ? 及后面的部分，比如 ?s=20、?t=…。",
  notify: "清理后显示提示",
  notifyHelp: "在 x.com 右下角显示一条小提示，带上复制进去的链接。",

  tryTitle: "试一个链接",
  tryLabel: "要清理的链接",
  tryPlaceholder: "粘贴一个 X 链接",
  tryIdle: "粘贴链接，看看「复制链接」会把什么放进剪贴板。",
  tryNoQuery: "这个链接没有 ? 部分，保持原样。",
  tryNotX: "不是 x.com 或 twitter.com 的链接，不会改动。",
  tryCopy: "复制",
  tryCopied: "已复制干净链接",
  tryCopyFailed: "复制失败",

  privacyTitle: "数据与隐私",
  privacyLead:
    "扩展只在 x.com 和 twitter.com 上运行。复制时它只看这次要复制的文字：如果正好是一条带 ? 的 x.com 链接，就把去掉 ? 之后的链接放进剪贴板。它不读取剪贴板里已有的内容，不发任何网络请求，也没有自己的服务器。",
  srcPost: "帖子链接",
  srcPostDesc: "分享 → 复制链接",
  srcProfile: "个人资料链接",
  srcProfileDesc: "··· → 复制链接到个人资料",
  srcManual: "你选中并复制的整条 x.com 链接",
  srcManualDesc: "输入框和发帖编辑器里的文字不会被改动",
  privacyStorage: "设置只保存在这个浏览器里（chrome.storage.local）。",

  version: "版本 {v}",
  reset: "恢复默认设置",
  resetDone: "已恢复默认设置",
  resetNoop: "已经是默认设置",
  undo: "撤销",
  undone: "已撤销，恢复为之前的设置",
  saved: "已保存",
  saveFailed: "保存失败",

  noteTitle: "已复制干净链接",
};

export const MESSAGES: Record<Locale, Record<string, string>> = { en: EN, zh: ZH };

export function t(locale: Locale, key: string): string {
  return MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
}

/** t() with {name} placeholders filled from vars. Unknown names stay as written. */
export function tf(locale: Locale, key: string, vars: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Word every [data-i18n] element's text and every [data-i18n-placeholder] input's placeholder. */
export function applyI18n(root: ParentNode, locale: Locale): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-i18n]"))) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(locale, key);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]"))) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(locale, key);
  }
}
