const LAST_MODEL_KEY = "sinamgpt_last_model";
const LAST_MIC_KEY = "sinamgpt_last_mic";

const readStoredValue = (key: string): string => {
  try {
    return localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
};

const persistValue = (key: string, value: string): void => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in privacy modes.
  }
};

export const readStoredModel = (): string => readStoredValue(LAST_MODEL_KEY);

export const persistModelChoice = (modelName: string): void => {
  if (modelName) persistValue(LAST_MODEL_KEY, modelName);
};

export const readStoredMic = (): string => readStoredValue(LAST_MIC_KEY);

export const persistMicChoice = (deviceId: string): void => {
  persistValue(LAST_MIC_KEY, deviceId);
};
