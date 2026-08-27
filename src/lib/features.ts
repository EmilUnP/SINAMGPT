import { getDb } from "@/lib/db";

const SETTINGS_KEY = "feature_flags";

export type FeatureId =
  | "developerApi"
  | "devLab"
  | "fileUpload"
  | "fileImport"
  | "microphone"
  | "jobQueue"
  | "toolCalling";

export type FeatureFlags = {
  developerApi: boolean;
  devLab: boolean;
  fileUpload: boolean;
  fileImport: boolean;
  microphone: boolean;
  jobQueue: boolean;
  toolCalling: boolean;
};

/** Off until an admin turns the surface on in Settings. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  developerApi: false,
  devLab: false,
  fileUpload: false,
  fileImport: false,
  microphone: false,
  jobQueue: false,
  toolCalling: false,
};

export const getFeatureFlags = (): FeatureFlags => {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row?.value) return { ...DEFAULT_FEATURE_FLAGS };
  try {
    const parsed = JSON.parse(row.value) as Partial<FeatureFlags>;
    return {
      developerApi: parsed.developerApi === true,
      devLab: parsed.devLab === true,
      fileUpload: parsed.fileUpload === true,
      fileImport: parsed.fileImport === true,
      microphone: parsed.microphone === true,
      jobQueue: parsed.jobQueue === true,
      toolCalling: parsed.toolCalling === true,
    };
  } catch {
    return { ...DEFAULT_FEATURE_FLAGS };
  }
};

export const setFeatureFlags = (
  next: Partial<FeatureFlags>,
): FeatureFlags => {
  const merged: FeatureFlags = {
    ...getFeatureFlags(),
    ...next,
  };
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
};

export const isFeatureEnabled = (id: FeatureId): boolean =>
  getFeatureFlags()[id] === true;

/** Images may arrive from plus-menu upload or drag/paste import. */
export const isChatImagesEnabled = (): boolean => {
  const flags = getFeatureFlags();
  return flags.fileUpload || flags.fileImport;
};

/** Audio may arrive from the microphone. */
export const isChatAudioEnabled = (): boolean => {
  const flags = getFeatureFlags();
  return flags.microphone;
};

export const FEATURE_DISABLED_ERROR = "This feature is currently disabled";
