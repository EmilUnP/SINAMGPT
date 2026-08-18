export type KnownModality = "text" | "image" | "audio";

export type KnownModelSpec = {
  id: "gemma4-e2b" | "gemma4-e4b" | "gemma4-31b";
  params: string;
  layers: string;
  slidingWindow: string;
  context: string;
  vocab: string;
  modalities: KnownModality[];
  visionEncoder: string;
  audioEncoder: string | null;
};

const GEMMA4_E2B: KnownModelSpec = {
  id: "gemma4-e2b",
  params: "2.3B effective (5.1B with embeddings)",
  layers: "35",
  slidingWindow: "512 tokens",
  context: "128K tokens",
  vocab: "262K",
  modalities: ["text", "image", "audio"],
  visionEncoder: "~150M",
  audioEncoder: "~300M",
};

const GEMMA4_E4B: KnownModelSpec = {
  id: "gemma4-e4b",
  params: "4.5B effective (8B with embeddings)",
  layers: "42",
  slidingWindow: "512 tokens",
  context: "128K tokens",
  vocab: "262K",
  modalities: ["text", "image", "audio"],
  visionEncoder: "~150M",
  audioEncoder: "~300M",
};

const GEMMA4_31B: KnownModelSpec = {
  id: "gemma4-31b",
  params: "30.7B dense",
  layers: "60",
  slidingWindow: "1024 tokens",
  context: "256K tokens",
  vocab: "262K",
  modalities: ["text", "image"],
  visionEncoder: "~550M",
  audioEncoder: null,
};

/** Official Gemma 4 card facts when the Ollama tag is one we know. */
export const lookupKnownModelSpec = (name: string): KnownModelSpec | null => {
  const id = name.trim().toLowerCase();
  if (!/gemma-?4/.test(id)) return null;
  if (/e2b/.test(id)) return GEMMA4_E2B;
  if (/e4b/.test(id)) return GEMMA4_E4B;
  if (/\b31b\b/.test(id)) return GEMMA4_31B;
  return null;
};

/** Gemma 4 E2B / E4B have an audio encoder; 31B dense does not. */
export const gemma4HasAudio = (name: string): boolean | null => {
  const spec = lookupKnownModelSpec(name);
  if (!spec) return null;
  return spec.modalities.includes("audio");
};
