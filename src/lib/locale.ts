export type AppLocale = "en" | "az";

export const LOCALES: AppLocale[] = ["en", "az"];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_STORAGE_KEY = "owngpt-locale";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  az: "Azərbaycan",
};

export const LOCALE_SHORT: Record<AppLocale, string> = {
  en: "EN",
  az: "AZ",
};

export const isAppLocale = (value: unknown): value is AppLocale =>
  value === "en" || value === "az";

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
    const locale = raw === "az" || raw === "en" ? raw : "en";
    document.documentElement.lang = locale;
  } catch (_) {}
})();`;
