export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "owngpt-theme";

export const resolveTheme = (
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme => {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemDark ? "dark" : "light";
};

export const applyThemeToDocument = (resolved: ResolvedTheme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.classList.toggle("dark", resolved === "dark");
};

export const readStoredTheme = (): ThemePreference => {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
};

export const storeTheme = (preference: ThemePreference) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore
  }
};

/** Inline boot script — prevents light flash before React hydrates. */
export const themeBootScript = `(() => {
  try {
    const key = ${JSON.stringify(THEME_STORAGE_KEY)};
    const stored = localStorage.getItem(key);
    const preference =
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved =
      preference === "dark" || (preference === "system" && systemDark)
        ? "dark"
        : "light";
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.classList.toggle("dark", resolved === "dark");
  } catch (_) {}
})();`;
