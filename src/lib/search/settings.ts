import { getDb } from "@/lib/db";
import { normalizeSearchProviderUrl } from "./ssrf";

export const WEB_SEARCH_SETTINGS_KEY = "web_search";

export type WebSearchEngine = "duckduckgo" | "searxng";

export type WebSearchSettings = {
  enabled: boolean;
  engine: WebSearchEngine;
  searxngBaseUrl: string;
  maxResults: number;
  fetchMaxChars: number;
  denyHosts: string[];
  dailyQuota: number;
  /**
   * Place assumed when a question needs one and names none ("will it rain
   * today?"). Replaces a hard-coded Baku. Empty means "ask the web as is".
   */
  defaultLocation: string;
};

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  enabled: false,
  engine: "duckduckgo",
  searxngBaseUrl: "",
  maxResults: 5,
  fetchMaxChars: 12_000,
  denyHosts: [],
  dailyQuota: 30,
  defaultLocation: "Baku, Azerbaijan",
};

const SETTINGS_TTL_MS = 2_000;
let settingsCache: { at: number; value: WebSearchSettings } | null = null;

const parseEngine = (value: unknown): WebSearchEngine =>
  value === "searxng" ? "searxng" : "duckduckgo";

const parseDenyHosts = (value: unknown): string[] => {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").join("\n")
        : "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/[\s,]+/)) {
    const host = line.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host || host.length > 253) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(host);
    if (out.length >= 100) break;
  }
  return out;
};

const parseLocation = (value: unknown): string =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f<>{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
    : DEFAULT_WEB_SEARCH_SETTINGS.defaultLocation;

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

export const parseWebSearchSettings = (
  raw: unknown,
  options: { seedFromEnv?: boolean } = {},
): WebSearchSettings => {
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const envSearx = options.seedFromEnv
    ? (process.env.SEARXNG_BASE_URL ?? "").trim()
    : "";
  const storedUrl =
    typeof parsed.searxngBaseUrl === "string" ? parsed.searxngBaseUrl.trim() : "";
  let searxngBaseUrl = storedUrl || envSearx;
  if (searxngBaseUrl) {
    try {
      searxngBaseUrl = normalizeSearchProviderUrl(searxngBaseUrl);
    } catch {
      searxngBaseUrl = storedUrl;
    }
  }
  return {
    enabled: parsed.enabled === true,
    engine: parseEngine(parsed.engine),
    searxngBaseUrl,
    maxResults: clampInt(parsed.maxResults, 5, 1, 10),
    fetchMaxChars: clampInt(parsed.fetchMaxChars, 12_000, 1_000, 12_000),
    denyHosts: parseDenyHosts(parsed.denyHosts),
    dailyQuota: clampInt(parsed.dailyQuota, 30, 0, 500),
    // Installs saved before this field existed keep the old Baku behaviour.
    defaultLocation: parseLocation(parsed.defaultLocation),
  };
};

export const getWebSearchSettings = (): WebSearchSettings => {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(WEB_SEARCH_SETTINGS_KEY) as { value: string } | undefined;
  let value = { ...DEFAULT_WEB_SEARCH_SETTINGS };
  if (row?.value) {
    try {
      value = parseWebSearchSettings(JSON.parse(row.value) as unknown);
    } catch {
      value = { ...DEFAULT_WEB_SEARCH_SETTINGS };
    }
  } else {
    value = parseWebSearchSettings({}, { seedFromEnv: true });
  }
  settingsCache = { at: Date.now(), value };
  return value;
};

export const isWebSearchEnabled = (): boolean => getWebSearchSettings().enabled;

export type WebSearchSettingsPatch = {
  enabled?: boolean;
  engine?: WebSearchEngine;
  searxngBaseUrl?: string;
  maxResults?: number;
  fetchMaxChars?: number;
  denyHosts?: string[] | string;
  dailyQuota?: number;
  defaultLocation?: string;
};

export const setWebSearchSettings = (
  patch: WebSearchSettingsPatch,
): WebSearchSettings => {
  const current = getWebSearchSettings();
  const nextInput = {
    enabled: patch.enabled ?? current.enabled,
    engine: patch.engine ?? current.engine,
    searxngBaseUrl:
      patch.searxngBaseUrl !== undefined ? patch.searxngBaseUrl : current.searxngBaseUrl,
    maxResults: patch.maxResults ?? current.maxResults,
    fetchMaxChars: patch.fetchMaxChars ?? current.fetchMaxChars,
    denyHosts: patch.denyHosts ?? current.denyHosts,
    dailyQuota: patch.dailyQuota ?? current.dailyQuota,
    defaultLocation: patch.defaultLocation ?? current.defaultLocation,
  };
  const next = parseWebSearchSettings(nextInput);
  if (next.engine === "searxng") {
    next.searxngBaseUrl = normalizeSearchProviderUrl(next.searxngBaseUrl);
  } else if (next.searxngBaseUrl) {
    try {
      next.searxngBaseUrl = normalizeSearchProviderUrl(next.searxngBaseUrl);
    } catch {
      next.searxngBaseUrl = "";
    }
  }
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(WEB_SEARCH_SETTINGS_KEY, JSON.stringify(next));
  settingsCache = { at: Date.now(), value: next };
  return next;
};

export const denyHostsToText = (hosts: string[]): string => hosts.join("\n");

export const resetWebSearchSettingsCache = (): void => {
  settingsCache = null;
};
