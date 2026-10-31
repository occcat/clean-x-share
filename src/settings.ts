import { detectLocale, type Locale } from "./i18n.ts";

export type Settings = {
  /** Clean links copied on x.com. */
  enabled: boolean;
  /** Show a note on x.com after a link was cleaned. */
  notify: boolean;
  locale: Locale;
  version: number;
};

export const SETTINGS_KEY = "settings";
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  notify: true,
  locale: "en",
  version: SETTINGS_VERSION,
};

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  return {
    enabled: r.enabled !== false,
    notify: r.notify !== false,
    locale: r.locale === "zh" || r.locale === "en" ? r.locale : detectLocale(),
    version: SETTINGS_VERSION,
  };
}

/** Stored settings, or the defaults in the browser's language. Never writes: the first save is the options page's. */
export async function loadSettings(): Promise<Settings> {
  try {
    const bag = await chrome.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(bag[SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS, locale: detectLocale() };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(s) });
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    fn(normalizeSettings(changes[SETTINGS_KEY].newValue));
  });
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return a.enabled === b.enabled && a.notify === b.notify && a.locale === b.locale && a.version === b.version;
}

/** Defaults, keeping the language: flipping it would reword the page under the "restored, undo" notice. */
export function restoreDefaults(current: Settings): Settings {
  return { ...DEFAULT_SETTINGS, locale: current.locale };
}
