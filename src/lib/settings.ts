import { getDb } from "@/lib/db";
import { inferCapabilities } from "@/lib/llm/capabilities";
import { inferModelKind, isModelKind } from "@/lib/llm/model-kind";
import { fleetDisplayName } from "@/lib/model-fleet";
import {
  getDefaultModel,
  listModels,
  listModelsFromProvider,
  type LlmBackend,
  type LlmModel,
  type ModelKind,
} from "@/lib/llm";
import {
  getFeatureFlags,
  setFeatureFlags,
  type FeatureFlags,
} from "@/lib/features";

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
const KEY_TOP_P = "chat_top_p";

const MODEL_REFRESH_TTL_MS = 60_000;
let lastModelRefreshAt = 0;
let modelRefreshInFlight: Promise<void> | null = null;

const normalizeModelKind = (value: string | null): ModelKind =>
  value && isModelKind(value) ? value : "chat";

export type ManagedModel = LlmModel & {
  is_enabled: boolean;
  display_name: string;
};

export type PublicModel = LlmModel & {
  display_name: string;
  vision: boolean;
  tools: boolean;
  audio: boolean;
  tts: boolean;
  video: boolean;
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
  topP: number;
  loggedInUnlimited: true;
  developerApiEnabled: boolean;
  devLabEnabled: boolean;
  fileUploadEnabled: boolean;
  fileImportEnabled: boolean;
  microphoneEnabled: boolean;
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
  parseIntClamped(getSetting(KEY_USER_MAX_CHARS), 5000, 500, 32000);

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

export const getTopPSetting = (): number =>
  parseFloatClamped(getSetting(KEY_TOP_P), 0.9, 0.05, 1);

export const setTopPSetting = (value: number) => {
  const safe = parseFloatClamped(String(value), 0.9, 0.05, 1);
  setSetting(KEY_TOP_P, String(safe));
  return safe;
};

export const getAppSettings = (): AppSettings => {
  const features = getFeatureFlags();
  return {
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
    topP: getTopPSetting(),
    loggedInUnlimited: true,
    developerApiEnabled: features.developerApi,
    devLabEnabled: features.devLab,
    fileUploadEnabled: features.fileUpload,
    fileImportEnabled: features.fileImport,
    microphoneEnabled: features.microphone,
  };
};

export const getPublicAppSettings = () => {
  const s = getAppSettings();
  return {
    guestEnabled: s.guestEnabled,
    registrationEnabled: s.registrationEnabled,
    guestDailyLimit: s.guestDailyLimit,
    guestMaxMessageChars: s.guestMaxMessageChars,
    developerApiEnabled: s.developerApiEnabled,
    devLabEnabled: s.devLabEnabled,
    fileUploadEnabled: s.fileUploadEnabled,
    fileImportEnabled: s.fileImportEnabled,
    microphoneEnabled: s.microphoneEnabled,
  };
};

export const setAppFeatureFlags = (next: Partial<FeatureFlags>): FeatureFlags =>
  setFeatureFlags(next);

export const getChatRuntimeOptions = () => ({
  temperature: getTemperatureSetting(),
  numPredict: getNumPredictSetting(),
  topP: getTopPSetting(),
});

/** Sync live provider models into DB. New names stay inactive until activated. */
export const syncModelsFromProviders = async (
  providerId?: string,
): Promise<ManagedModel[]> => {
  const liveModels = providerId
    ? await listModelsFromProvider(providerId)
    : await listModels();
  const db = getDb();
  const hadAny = Boolean(
    db.prepare(`SELECT 1 AS ok FROM models LIMIT 1`).get(),
  );
  // First catalog fill enables current provider models so setup works.
  // Later pulls insert as inactive until Admin → Models → Activate.
  const enableNew = hadAny ? 0 : 1;

  const upsert = db.prepare(
    `INSERT INTO models
       (name, is_enabled, backend, kind, vision, tools, audio, tts, video, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET
       backend = excluded.backend,
       vision = excluded.vision,
       tools = excluded.tools,
       audio = excluded.audio,
       tts = excluded.tts,
       video = excluded.video,
       updated_at = datetime('now')`,
  );

  const sync = db.transaction(
    (
      rows: Array<{
        name: string;
        backend: LlmBackend;
        kind: ModelKind;
        vision: boolean;
        tools: boolean;
        audio: boolean;
        tts: boolean;
        video: boolean;
      }>,
    ) => {
      for (const row of rows) {
        upsert.run(
          row.name,
          enableNew,
          row.backend,
          row.kind,
          row.vision ? 1 : 0,
          row.tools ? 1 : 0,
          row.audio ? 1 : 0,
          row.tts ? 1 : 0,
          row.video ? 1 : 0,
        );
      }
    },
  );
  sync(
    liveModels.map((m) => ({
      name: m.name,
      backend: m.backend,
      kind: m.kind,
      vision: Boolean(m.vision),
      tools: Boolean(m.tools),
      audio: Boolean(m.audio),
      tts: Boolean(m.tts),
      video: Boolean(m.video),
    })),
  );

  const rows = db
    .prepare(`SELECT name, is_enabled, display_name, backend, kind FROM models`)
    .all() as Array<{
    name: string;
    is_enabled: number;
    display_name: string | null;
    backend: string | null;
    kind: string | null;
  }>;
  const metaMap = new Map(
    rows.map((row) => [
      row.name,
      {
        is_enabled: row.is_enabled === 1,
        display_name: row.display_name,
        backend: (row.backend?.trim() || "ollama") as LlmBackend,
        kind: normalizeModelKind(row.kind),
      },
    ]),
  );

  const persistName = db.prepare(
    `UPDATE models SET display_name = ?, updated_at = datetime('now') WHERE name = ?`,
  );
  const persistFleetNames = db.transaction(
    (items: Array<{ name: string; display_name: string }>) => {
      for (const item of items) persistName.run(item.display_name, item.name);
    },
  );
  persistFleetNames(
    liveModels.flatMap((m) => {
      const storedName = metaMap.get(m.name)?.display_name?.trim() ?? "";
      const friendly = fleetDisplayName(m.name);
      if (!friendly) return [];
      if (storedName && storedName !== m.name) return [];
      if (storedName === friendly) return [];
      return [{ name: m.name, display_name: friendly }];
    }),
  );

  lastModelRefreshAt = Date.now();
  return liveModels.map((m) => {
    const meta = metaMap.get(m.name);
    const storedName = meta?.display_name?.trim() ?? "";
    const friendly = fleetDisplayName(m.name);
    const display_name =
      storedName && storedName !== m.name
        ? storedName
        : friendly || storedName || m.name;
    return {
      ...m,
      backend: meta?.backend ?? m.backend,
      kind: meta?.kind ?? m.kind,
      is_enabled: meta?.is_enabled ?? false,
      display_name,
      vision: Boolean(m.vision),
      tools: Boolean(m.tools),
      audio: Boolean(m.audio),
      tts: Boolean(m.tts),
      video: Boolean(m.video),
    };
  });
};

/** @deprecated Use syncModelsFromProviders. */
export const syncModelsFromOllama = syncModelsFromProviders;

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
       VALUES (?, ?, 0, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at = datetime('now')`,
    )
    .run(name, stored);
};

export const setModelKind = (name: string, kind: ModelKind) => {
  getDb()
    .prepare(
      `UPDATE models SET kind = ?, updated_at = datetime('now') WHERE name = ?`,
    )
    .run(kind, name);
};

/** Map UI label or model id → stored model name. */
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

  // Unknown / not yet activated: keep it off the user picker
  if (!row) return false;
  return row.is_enabled === 1;
};

export const getModelKind = (name: string): ModelKind => {
  const resolved = resolveOllamaModelName(name);
  const row = getDb()
    .prepare(`SELECT kind FROM models WHERE name = ?`)
    .get(resolved) as { kind: string } | undefined;
  return row && isModelKind(row.kind) ? row.kind : inferModelKind(resolved);
};

export const isChatModel = (name: string): boolean =>
  getModelKind(name) === "chat";

export const modelSupportsVision = (name: string): boolean => {
  const resolved = resolveOllamaModelName(name);
  const row = getDb()
    .prepare(`SELECT vision FROM models WHERE name = ?`)
    .get(resolved) as { vision: number } | undefined;
  if (row) return row.vision === 1;
  return inferCapabilities(resolved).vision;
};

export const modelSupportsTools = (name: string): boolean => {
  const resolved = resolveOllamaModelName(name);
  const row = getDb()
    .prepare(`SELECT tools FROM models WHERE name = ?`)
    .get(resolved) as { tools: number } | undefined;
  if (row) return row.tools === 1;
  return inferCapabilities(resolved).tools;
};

export const modelSupportsAudio = (name: string): boolean => {
  const resolved = resolveOllamaModelName(name);
  const row = getDb()
    .prepare(`SELECT audio FROM models WHERE name = ?`)
    .get(resolved) as { audio: number } | undefined;
  if (row) return row.audio === 1;
  return inferCapabilities(resolved).audio;
};

const displayNameFor = (name: string, stored: string | null): string => {
  const storedName = stored?.trim() ?? "";
  const friendly = fleetDisplayName(name);
  if (storedName && storedName !== name) return storedName;
  return friendly || storedName || name;
};

export const listStoredModels = (): ManagedModel[] => {
  const rows = getDb()
    .prepare(
      `SELECT name, is_enabled, display_name, backend, kind,
              vision, tools, audio, tts, video, updated_at
       FROM models`,
    )
    .all() as Array<{
    name: string;
    is_enabled: number;
    display_name: string | null;
    backend: string | null;
    kind: string | null;
    vision: number;
    tools: number;
    audio: number;
    tts: number;
    video: number;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    name: row.name,
    size: 0,
    modified_at: row.updated_at,
    backend: (row.backend?.trim() || "ollama") as LlmBackend,
    kind: normalizeModelKind(row.kind),
    is_enabled: row.is_enabled === 1,
    display_name: displayNameFor(row.name, row.display_name),
    vision: row.vision === 1,
    tools: row.tools === 1,
    audio: row.audio === 1,
    tts: row.tts === 1,
    video: row.video === 1,
  }));
};

const toPublicModel = (model: ManagedModel): PublicModel => {
  const { is_enabled: _ignored, ...rest } = model;
  return {
    ...rest,
    vision: Boolean(model.vision),
    tools: Boolean(model.tools),
    audio: Boolean(model.audio),
    tts: Boolean(model.tts),
    video: Boolean(model.video),
  };
};

const packEnabledModels = (
  models: PublicModel[],
): { models: PublicModel[]; defaultModel: string } => {
  const names = models.map((model) => model.name);
  const preferred = getDefaultModelSetting();
  const defaultModel =
    preferred && names.includes(preferred)
      ? preferred
      : getDefaultModel(names);
  return { models, defaultModel };
};

const scheduleBackgroundModelRefresh = () => {
  if (modelRefreshInFlight) return;
  if (Date.now() - lastModelRefreshAt < MODEL_REFRESH_TTL_MS) return;
  modelRefreshInFlight = syncModelsFromProviders()
    .then(() => undefined)
    .catch((error) => {
      console.warn(
        "[OwnGPT] Background model refresh failed:",
        error instanceof Error ? error.message : error,
      );
    })
    .finally(() => {
      modelRefreshInFlight = null;
    });
};

export const getEnabledModels = async (): Promise<{
  models: PublicModel[];
  defaultModel: string;
}> => {
  const stored = listStoredModels()
    .filter((model) => model.is_enabled && model.kind === "chat")
    .map(toPublicModel);
  if (stored.length > 0) {
    scheduleBackgroundModelRefresh();
    return packEnabledModels(stored);
  }

  const all = await syncModelsFromProviders();
  return packEnabledModels(
    all
      .filter((model) => model.is_enabled && model.kind === "chat")
      .map(toPublicModel),
  );
};
