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
  applyThemeToDocument,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

/*
 * Both inputs to the theme live outside React — the OS colour scheme and
 * localStorage — so they are read through useSyncExternalStore rather than
 * mirrored into state by a mount effect. The server snapshots match what
 * themeBootScript assumes before hydration.
 */

const subscribeSystemDark = (onChange: () => void) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

const getSystemDarkSnapshot = () => window.matchMedia(DARK_QUERY).matches;
const getSystemDarkServerSnapshot = () => false;

/** Cached so the snapshot stays referentially stable between writes. */
let preferenceCache: ThemePreference | null = null;
const preferenceListeners = new Set<() => void>();

const subscribePreference = (onChange: () => void) => {
  preferenceListeners.add(onChange);
  return () => {
    preferenceListeners.delete(onChange);
  };
};

const getPreferenceSnapshot = (): ThemePreference => {
  if (preferenceCache === null) preferenceCache = readStoredTheme();
  return preferenceCache;
};

const getPreferenceServerSnapshot = (): ThemePreference => "system";

const writePreference = (next: ThemePreference) => {
  preferenceCache = next;
  storeTheme(next);
  for (const listener of preferenceListeners) listener();
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getSystemDarkServerSnapshot,
  );

  const resolved = useMemo(
    () => resolveTheme(preference, systemDark),
    [preference, systemDark],
  );

  useLayoutEffect(() => {
    applyThemeToDocument(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    writePreference(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
};
