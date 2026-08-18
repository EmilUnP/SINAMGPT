export type FleetId =
  | "gemma3-4b"
  | "gemma3-12b"
  | "gemma4-e4b"
  | "gemma4-26b"
  | "gemma4-31b"
  | "llama4-scout"
  | "llama4-maverick"
  | "qwen3-32b"
  | "qwen35-9b";

/** Ollama tags on the company RTX 5090 box. */
export const FLEET_TAGS = [
  "gemma3:4b",
  "gemma3:12b",
  "gemma4:e4b",
  "gemma4:26b",
  "gemma4:31b",
  "llama4:scout",
  "llama4:maverick",
  "qwen3.5:9b",
  "qwen3:32b",
] as const;

const FLEET_DISPLAY: Record<FleetId, string> = {
  "gemma3-4b": "Gemma 3 4B",
  "gemma3-12b": "Gemma 3 12B",
  "gemma4-e4b": "Gemma 4 E4B",
  "gemma4-26b": "Gemma 4 26B",
  "gemma4-31b": "Gemma 4 31B",
  "llama4-scout": "Llama 4 Scout",
  "llama4-maverick": "Llama 4 Maverick",
  "qwen3-32b": "Qwen 3 32B",
  "qwen35-9b": "Qwen 3.5 9B",
};

export const matchFleetModel = (name: string): FleetId | null => {
  const id = name.trim().toLowerCase();
  if (/qwen3\.5/.test(id) && /(?:^|[:\-_])9b\b/.test(id)) return "qwen35-9b";
  if (/qwen3/.test(id) && !/qwen3\.5/.test(id) && /(?:^|[:\-_])32b\b/.test(id)) {
    return "qwen3-32b";
  }
  if (/llama-?4/.test(id) && (/maverick/.test(id) || /128x17b/.test(id))) {
    return "llama4-maverick";
  }
  if (
    /llama-?4/.test(id) &&
    (/scout/.test(id) || /16x17b/.test(id) || /^llama-?4(?::latest)?$/.test(id))
  ) {
    return "llama4-scout";
  }
  if (/gemma-?4/.test(id) && /e4b/.test(id)) return "gemma4-e4b";
  if (/gemma-?4/.test(id) && /(?:^|[:\-_])26b\b/.test(id)) return "gemma4-26b";
  if (/gemma-?4/.test(id) && /(?:^|[:\-_])31b\b/.test(id)) return "gemma4-31b";
  if (/gemma3/.test(id) && /(?:^|[:\-_])12b\b/.test(id)) return "gemma3-12b";
  if (/gemma3/.test(id) && /(?:^|[:\-_])4b\b/.test(id) && !/e4b|12b/.test(id)) {
    return "gemma3-4b";
  }
  return null;
};

export const fleetDisplayName = (name: string): string | null => {
  const id = matchFleetModel(name);
  return id ? FLEET_DISPLAY[id] : null;
};

/** Short picker subtitle, Gemini-style ("Fastest answers"). */
export const fleetHintKey = (
  name: string,
): `chat.modelHint.${FleetId}` | null => {
  const id = matchFleetModel(name);
  return id ? `chat.modelHint.${id}` : null;
};

/** Qwen 3.5 is natively multimodal (text + image; Ollama may also list video). */
export const isQwen35Vision = (name: string): boolean => /qwen3\.5/i.test(name);

/** Llama 4 (Maverick / Scout) is natively multimodal: text + image, not microphone. */
export const isLlama4Vision = (name: string): boolean => /llama-?4/i.test(name);
