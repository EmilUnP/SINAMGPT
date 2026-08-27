import type { ModelKind } from "./types";

const TASK_PATTERNS: Array<[ModelKind, RegExp]> = [
  ["stt", /\b(whisper|asr|speech[-_ ]?to[-_ ]?text)\b/i],
  [
    "tts",
    /\b(tts|piper|kokoro|orpheus|xtts|bark|chatterbox|speecht5|parler|fish[-_ ]?speech|styletts|f5[-_ ]?tts)\b/i,
  ],
  [
    "embedding",
    /\b(embed(?:ding)?|nomic[-_ ]?embed|bge[-_ ]?(?:m3|embed)|e5[-_:]|mxbai[-_ ]?embed)\b/i,
  ],
  ["rerank", /\b(rerank(?:er)?|cross[-_ ]?encoder|jina[-_ ]?reranker)\b/i],
  [
    "video",
    /\b(cogvideo|animatediff|wan[-_:]?(?:video|2)|hunyuan[-_ ]?video|video[-_ ]?(?:gen|generation))\b/i,
  ],
  [
    "image",
    /\b(flux|sdxl|stable[-_ ]?diffusion|dall[-_ ]?e|image[-_ ]?(?:gen|generation))\b/i,
  ],
];

export const MODEL_KINDS = [
  "chat",
  "image",
  "video",
  "stt",
  "tts",
  "embedding",
  "rerank",
] as const satisfies readonly ModelKind[];

export const inferModelKind = (name: string): ModelKind => {
  const normalized = name.trim().toLowerCase();
  for (const [kind, pattern] of TASK_PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }
  return "chat";
};

export const isModelKind = (value: string): value is ModelKind =>
  MODEL_KINDS.includes(value as ModelKind);
