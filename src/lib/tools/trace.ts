import type { ToolTraceEntry } from "@/lib/types";

export const MAX_TOOL_TRACE_ENTRIES = 32;
const MAX_TRACE_VALUE_CHARS = 2_048;
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie/i;
const SECRET_VALUE =
  /\b(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g;

const redactValue = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 64).map((item) => redactValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 64)
        .map(([key, child]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactValue(child, depth + 1),
        ]),
    );
  }
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE, "[REDACTED]");
  }
  return value;
};

export const serializeTraceValue = (value: unknown): string => {
  let serialized: string;
  try {
    serialized = JSON.stringify(redactValue(value));
  } catch {
    serialized = '"[UNSERIALIZABLE]"';
  }
  return serialized.length > MAX_TRACE_VALUE_CHARS
    ? `${serialized.slice(0, MAX_TRACE_VALUE_CHARS - 1)}…`
    : serialized;
};

export const boundToolTrace = (
  entries: ToolTraceEntry[],
): ToolTraceEntry[] => entries.slice(0, MAX_TOOL_TRACE_ENTRIES);
