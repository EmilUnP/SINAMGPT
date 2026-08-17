export type AppLocale = "en" | "az" | "ru";

export const LOCALES: AppLocale[] = ["en", "az", "ru"];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_STORAGE_KEY = "owngpt-locale";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  az: "Azərbaycan",
  ru: "Русский",
};

export const LOCALE_SHORT: Record<AppLocale, string> = {
  en: "EN",
  az: "AZ",
  ru: "RU",
};

export const LOCALE_BCP47: Record<AppLocale, string> = {
  en: "en-US",
  az: "az-AZ",
  ru: "ru-RU",
};

export const isAppLocale = (value: unknown): value is AppLocale =>
  value === "en" || value === "az" || value === "ru";

export const readStoredLocale = (): AppLocale => {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
};

export const storeLocale = (locale: AppLocale) => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
};

export const applyLocaleToDocument = (locale: AppLocale) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
};

/** Inline boot script — sets <html lang> before React hydrates. */
export const localeBootScript = `(() => {
  try {
    const key = ${JSON.stringify(LOCALE_STORAGE_KEY)};
    const raw = localStorage.getItem(key);
    const locale = raw === "az" || raw === "en" || raw === "ru" ? raw : "en";
    document.documentElement.lang = locale;
  } catch (_) {}
})();`;
