export type KnownModality = "text" | "image" | "audio";

export type KnownModelSpec = {
  id: "gemma4-e2b" | "gemma4-e4b" | "gemma4-26b" | "gemma4-31b";
  params: string;
  layers: string;
  slidingWindow: string;
  context: string;
  vocab: string;
  modalities: KnownModality[];
  visionEncoder: string;
  audioEncoder: string | null;
};

const GEMMA4_MODALITIES: KnownModality[] = ["text", "image", "audio"];

const GEMMA4_E2B: KnownModelSpec = {
  id: "gemma4-e2b",
  params: "2.3B effective (5.1B with embeddings)",
  layers: "35",
  slidingWindow: "512 tokens",
  context: "128K tokens",
  vocab: "262K",
  modalities: GEMMA4_MODALITIES,
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
  modalities: GEMMA4_MODALITIES,
  visionEncoder: "~150M",
  audioEncoder: "~300M",
};

const GEMMA4_26B: KnownModelSpec = {
  id: "gemma4-26b",
  params: "26B dense",
  layers: "—",
  slidingWindow: "1024 tokens",
  context: "256K tokens",
  vocab: "262K",
  modalities: GEMMA4_MODALITIES,
  visionEncoder: "~550M",
  audioEncoder: "~300M",
};

const GEMMA4_31B: KnownModelSpec = {
  id: "gemma4-31b",
  params: "30.7B dense",
  layers: "60",
  slidingWindow: "1024 tokens",
  context: "256K tokens",
  vocab: "262K",
  modalities: GEMMA4_MODALITIES,
  visionEncoder: "~550M",
  audioEncoder: "~300M",
};

/** Official Gemma 4 card facts when the Ollama tag is one we know. */
export const lookupKnownModelSpec = (name: string): KnownModelSpec | null => {
  const id = name.trim().toLowerCase();
  if (!/gemma-?4/.test(id)) return null;
  if (/e2b/.test(id)) return GEMMA4_E2B;
  if (/e4b/.test(id)) return GEMMA4_E4B;
  if (/(?:^|[:\-_])26b\b/.test(id)) return GEMMA4_26B;
  if (/(?:^|[:\-_])31b\b/.test(id)) return GEMMA4_31B;
  return null;
};

export const isGemma4 = (name: string): boolean => /gemma-?4/i.test(name);

/** Every Gemma 4 Ollama tag lists audio (vision, tools, and thinking too). */
export const gemma4HasAudio = (name: string): boolean | null => {
  if (!isGemma4(name)) return null;
  return true;
};
