import { gemma4HasAudio } from "@/lib/model-specs";
import { isQwen35Vision } from "@/lib/model-fleet";

export type ModelCapabilities = {
  vision: boolean;
  tools: boolean;
  audio: boolean;
  video: boolean;
};
const TOOLS_RE =
  /\b(llama3\.[123]|llama-?3\.[123]|qwen2\.5|qwen3|mistral|mixtral|command-?r|firefunction|gpt-oss|deepseek-r1)\b/i;

const VISION_RE =
  /\b(llava|bakllava|moondream|pixtral|internvl|minicpm-v|granite-vision|phi-?3-vision|phi-?4-multimodal|llama3\.2-vision|llama-?3\.2-vision|qwen2(\.5)?-vl|qwen2vl|qwen-vl|qwen3-vl|gemma-?4)\b/i;

const AUDIO_RE =
  /\b(whisper|audio|omni|qwen2-audio|qwen2\.5-omni|qwen3-omni)\b/i;

const VIDEO_RE = /\b(video|omni|qwen2\.5-omni|qwen3-omni|qwen3\.5)\b/i;

/** Gemma 3 4B+ is multimodal; the 1B variant is text-only. */
const isGemma3Vision = (name: string): boolean => {
  if (!/gemma3/i.test(name)) return false;
  if (/\b1b\b/i.test(name) || /:1b\b/i.test(name)) return false;
  return true;
};

/** Name-based fallback when Ollama `/api/show` has no capabilities list. */
export const inferCapabilities = (name: string): ModelCapabilities => {
  const id = name.trim();
  const vision =
    VISION_RE.test(id) ||
    isGemma3Vision(id) ||
    isQwen35Vision(id) ||
    /vision/i.test(id) ||
    /[-_/]vl\b/i.test(id) ||
    /\bvl[-_]/i.test(id);
  const gemma4Audio = gemma4HasAudio(id);
  return {
    vision,
    tools: TOOLS_RE.test(id) || /gemma[34]/i.test(id),
    audio: gemma4Audio ?? AUDIO_RE.test(id),
    video: VIDEO_RE.test(id),
  };
};

export const parseOllamaCapabilities = (
  raw: unknown,
  fallbackName: string,
): ModelCapabilities => {
  const heuristic = inferCapabilities(fallbackName);
  if (!Array.isArray(raw)) return heuristic;
  const caps = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.toLowerCase());
  const gemma4Audio = gemma4HasAudio(fallbackName);
  const audioFromOllama = caps.includes("audio") || heuristic.audio;
  return {
    vision: caps.includes("vision") || heuristic.vision,
    tools: caps.includes("tools") || heuristic.tools,
    audio: gemma4Audio == null ? audioFromOllama : gemma4Audio,
    // Ollama has no video capability flag yet — name heuristic only.
    video: heuristic.video,
  };
};
