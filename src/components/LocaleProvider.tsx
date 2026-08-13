"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyLocaleToDocument,
  DEFAULT_LOCALE,
  readStoredLocale,
  storeLocale,
  type AppLocale,
} from "@/lib/locale";
import {
  translate,
  type MessageKey,
  type TranslateVars,
} from "@/messages";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: (key: MessageKey, vars?: TranslateVars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

let localeCache: AppLocale | null = null;
const localeListeners = new Set<() => void>();

const subscribeLocale = (onChange: () => void) => {
  localeListeners.add(onChange);
  return () => {
    localeListeners.delete(onChange);
  };
};

const getLocaleSnapshot = (): AppLocale => {
  if (localeCache === null) localeCache = readStoredLocale();
  return localeCache;
};

const getLocaleServerSnapshot = (): AppLocale => DEFAULT_LOCALE;

const writeLocale = (next: AppLocale) => {
  localeCache = next;
  storeLocale(next);
  for (const listener of localeListeners) listener();
};

export const LocaleProvider = ({ children }: { children: ReactNode }) => {
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getLocaleServerSnapshot,
  );

  useLayoutEffect(() => {
    applyLocaleToDocument(locale);
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    writeLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
};

export const useTranslations = () => useLocale().t;
