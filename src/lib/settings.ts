import { getDb } from "@/lib/db";
import { getDefaultModel, listModels, type OllamaModel } from "@/lib/ollama";

const KEY_GUEST_DAILY_LIMIT = "guest_daily_limit";
const KEY_GUEST_MAX_CHARS = "guest_max_message_chars";
const KEY_GUEST_ENABLED = "guest_enabled";
const KEY_GUEST_HISTORY_LIMIT = "guest_history_limit";
const KEY_REGISTRATION_ENABLED = "registration_enabled";
const KEY_DEFAULT_MODEL = "default_model";
const KEY_USER_MAX_CHARS = "user_max_message_chars";
const KEY_USER_HISTORY_LIMIT = "user_history_limit";
const KEY_TEMPERATURE = "chat_temperature";
const KEY_NUM_PREDICT = "chat_num_predict";

export type ManagedModel = OllamaModel & {
  is_enabled: boolean;
  display_name: string;
};

export type PublicModel = OllamaModel & {
  display_name: string;
};

export type AppSettings = {
  guestEnabled: boolean;
  guestDailyLimit: number;
  guestMaxMessageChars: number;
  guestHistoryLimit: number;
  registrationEnabled: boolean;
  defaultModel: string;
  userMaxMessageChars: number;
  userHistoryLimit: number;
  temperature: number;
  numPredict: number;
  loggedInUnlimited: true;
};

const getSetting = (key: string): string | null => {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
};

const setSetting = (key: string, value: string) => {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
};

const parseBool = (raw: string | null, fallback: boolean): boolean => {
  if (raw == null) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
};

const parseIntClamped = (
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

const parseFloatClamped = (
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 100) / 100;
  return Math.max(min, Math.min(max, rounded));
};

export const getGuestDailyLimitSetting = (): number => {
  const fromDb = getSetting(KEY_GUEST_DAILY_LIMIT);
  const n = Number(fromDb ?? process.env.GUEST_DAILY_LIMIT ?? "5");
  if (!Number.isFinite(n) || n < 0) return 5;
  return Math.floor(n);
};

export const setGuestDailyLimitSetting = (limit: number) => {
  const safe = Math.max(0, Math.min(1000, Math.floor(limit)));
  setSetting(KEY_GUEST_DAILY_LIMIT, String(safe));
  return safe;
};

export const getGuestMaxCharsSetting = (): number => {
  const fromDb = getSetting(KEY_GUEST_MAX_CHARS);
  const n = Number(fromDb ?? process.env.GUEST_MAX_MESSAGE_CHARS ?? "2000");
  if (!Number.isFinite(n) || n < 100) return 2000;
  return Math.floor(n);
};

export const setGuestMaxCharsSetting = (chars: number) => {
  const safe = Math.max(100, Math.min(20000, Math.floor(chars)));
  setSetting(KEY_GUEST_MAX_CHARS, String(safe));
  return safe;
};

export const getGuestEnabledSetting = (): boolean =>
  parseBool(getSetting(KEY_GUEST_ENABLED), true);

export const setGuestEnabledSetting = (enabled: boolean) => {
  setSetting(KEY_GUEST_ENABLED, enabled ? "1" : "0");
  return enabled;
};

export const getGuestHistoryLimitSetting = (): number =>
  parseIntClamped(getSetting(KEY_GUEST_HISTORY_LIMIT), 10, 0, 40);

export const setGuestHistoryLimitSetting = (limit: number) => {
  const safe = Math.max(0, Math.min(40, Math.floor(limit)));
  setSetting(KEY_GUEST_HISTORY_LIMIT, String(safe));
  return safe;
};

export const getRegistrationEnabledSetting = (): boolean =>
  parseBool(getSetting(KEY_REGISTRATION_ENABLED), true);

export const setRegistrationEnabledSetting = (enabled: boolean) => {
  setSetting(KEY_REGISTRATION_ENABLED, enabled ? "1" : "0");
  return enabled;
};

export const getDefaultModelSetting = (): string => {
  const fromDb = (getSetting(KEY_DEFAULT_MODEL) ?? "").trim();
  if (fromDb) return fromDb;
  return (process.env.DEFAULT_MODEL ?? "").trim();
};

export const setDefaultModelSetting = (model: string) => {
  const safe = model.trim().slice(0, 120);
  setSetting(KEY_DEFAULT_MODEL, safe);
  return safe;
};

export const getUserMaxCharsSetting = (): number =>
  parseIntClamped(getSetting(KEY_USER_MAX_CHARS), 12000, 500, 32000);

export const setUserMaxCharsSetting = (chars: number) => {
  const safe = Math.max(500, Math.min(32000, Math.floor(chars)));
  setSetting(KEY_USER_MAX_CHARS, String(safe));
  return safe;
};

/** 0 = send full conversation history to the model. */
export const getUserHistoryLimitSetting = (): number =>
  parseIntClamped(getSetting(KEY_USER_HISTORY_LIMIT), 40, 0, 200);

export const setUserHistoryLimitSetting = (limit: number) => {
  const safe = Math.max(0, Math.min(200, Math.floor(limit)));
  setSetting(KEY_USER_HISTORY_LIMIT, String(safe));
  return safe;
};

export const getTemperatureSetting = (): number =>
  parseFloatClamped(getSetting(KEY_TEMPERATURE), 0.7, 0, 2);

export const setTemperatureSetting = (value: number) => {
  const safe = parseFloatClamped(String(value), 0.7, 0, 2);
  setSetting(KEY_TEMPERATURE, String(safe));
  return safe;
};

/** -1 = Ollama default / unlimited. */
export const getNumPredictSetting = (): number => {
  const raw = getSetting(KEY_NUM_PREDICT);
  if (raw == null || raw.trim() === "") return -1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return -1;
  if (n < 0) return -1;
  return Math.min(8192, Math.floor(n));
};

export const setNumPredictSetting = (value: number) => {
  const safe =
    !Number.isFinite(value) || value < 0
      ? -1
      : Math.min(8192, Math.floor(value));
  setSetting(KEY_NUM_PREDICT, String(safe));
  return safe;
};

export const getAppSettings = (): AppSettings => ({
  guestEnabled: getGuestEnabledSetting(),
  guestDailyLimit: getGuestDailyLimitSetting(),
  guestMaxMessageChars: getGuestMaxCharsSetting(),
  guestHistoryLimit: getGuestHistoryLimitSetting(),
  registrationEnabled: getRegistrationEnabledSetting(),
  defaultModel: getDefaultModelSetting(),
  userMaxMessageChars: getUserMaxCharsSetting(),
  userHistoryLimit: getUserHistoryLimitSetting(),
  temperature: getTemperatureSetting(),
  numPredict: getNumPredictSetting(),
  loggedInUnlimited: true,
});

export const getPublicAppSettings = () => {
  const s = getAppSettings();
  return {
    guestEnabled: s.guestEnabled,
    registrationEnabled: s.registrationEnabled,
    guestDailyLimit: s.guestDailyLimit,
    guestMaxMessageChars: s.guestMaxMessageChars,
  };
};

export const getChatRuntimeOptions = () => ({
  temperature: getTemperatureSetting(),
  numPredict: getNumPredictSetting(),
});

const normalizeDisplayName = (
  value: string | null | undefined,
  fallback: string,
) => {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
};

/** Sync Ollama tags into DB; new models default to enabled. */
export const syncModelsFromOllama = async (): Promise<ManagedModel[]> => {
  const ollamaModels = await listModels();
  const db = getDb();

  const upsert = db.prepare(
    `INSERT INTO models (name, is_enabled, updated_at)
     VALUES (?, 1, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now')`,
  );

  const sync = db.transaction((names: string[]) => {
    for (const name of names) upsert.run(name);
  });
  sync(ollamaModels.map((m) => m.name));

  const rows = db
    .prepare(`SELECT name, is_enabled, display_name FROM models`)
    .all() as Array<{
    name: string;
    is_enabled: number;
    display_name: string | null;
  }>;
  const metaMap = new Map(
    rows.map((row) => [
      row.name,
      {
        is_enabled: row.is_enabled === 1,
        display_name: row.display_name,
      },
    ]),
  );

  return ollamaModels.map((m) => {
    const meta = metaMap.get(m.name);
    return {
      ...m,
      is_enabled: meta?.is_enabled ?? true,
      display_name: normalizeDisplayName(meta?.display_name, m.name),
    };
  });
};

export const setModelEnabled = (name: string, enabled: boolean) => {
  getDb()
    .prepare(
      `INSERT INTO models (name, is_enabled, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         is_enabled = excluded.is_enabled,
         updated_at = datetime('now')`,
    )
    .run(name, enabled ? 1 : 0);
};

export const setModelDisplayName = (name: string, displayName: string) => {
  const safe = displayName.trim().slice(0, 120);
  const stored = safe.length > 0 ? safe : null;

  getDb()
    .prepare(
      `INSERT INTO models (name, display_name, is_enabled, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = datetime('now')`,
    )
    .run(name, stored);
};

/** Map UI label or Ollama id → real Ollama model name. */
export const resolveOllamaModelName = (requested: string): string => {
  const value = requested.trim();
  if (!value) return value;

  const byName = getDb()
    .prepare(`SELECT name FROM models WHERE name = ?`)
    .get(value) as { name: string } | undefined;
  if (byName) return byName.name;

  const byDisplay = getDb()
    .prepare(
      `SELECT name FROM models
       WHERE display_name = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .get(value) as { name: string } | undefined;
  if (byDisplay) return byDisplay.name;

  return value;
};

export const isModelEnabled = (name: string): boolean => {
  const resolved = resolveOllamaModelName(name);
  const row = getDb()
    .prepare(`SELECT is_enabled FROM models WHERE name = ?`)
    .get(resolved) as { is_enabled: number } | undefined;

  // Unknown model (not synced yet): allow until admin disables after sync
  if (!row) return true;
  return row.is_enabled === 1;
};

export const getEnabledModels = async (): Promise<{
  models: PublicModel[];
  defaultModel: string;
}> => {
  const all = await syncModelsFromOllama();
  const enabled = all.filter((m) => m.is_enabled);
  const names = enabled.map((m) => m.name);
  const preferred = getDefaultModelSetting();
  const defaultModel =
    preferred && names.includes(preferred)
      ? preferred
      : getDefaultModel(names);
  return {
    models: enabled.map(({ is_enabled: _ignored, ...rest }) => rest),
    defaultModel,
  };
};
