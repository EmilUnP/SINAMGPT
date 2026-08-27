import { checkToolPayloadGuardrails } from "@/lib/guardrails";
import type { ToolPayloadGuard } from "./types";

export { registeredTools, toolRegistry } from "./bootstrap";
export { shouldUseToolRuntime } from "./gate";
export {
  DEFAULT_MAX_TOOL_ITERATIONS,
  DEFAULT_TOOL_CALL_TIMEOUT_MS,
  runToolLoop,
} from "./loop";
export { ToolRegistry } from "./registry";
export { encodeToolSseEvent, type ToolSseEvent } from "./sse";
export {
  MAX_TOOL_TRACE_ENTRIES,
  boundToolTrace,
  serializeTraceValue,
} from "./trace";
export type {
  JsonPrimitive,
  JsonValue,
  ToolCompletion,
  ToolContext,
  ToolDefinition,
  ToolLoopOptions,
  ToolLoopResult,
  ToolPayloadGuard,
} from "./types";
export {
  MAX_TOOL_PAYLOAD_BYTES,
  MAX_TOOL_SCHEMA_BYTES,
} from "./validation";

/** Default local-only guard used for every serialized tool input and output. */
export const inspectToolPayload: ToolPayloadGuard = async (
  serializedPayload,
) => checkToolPayloadGuardrails(serializedPayload, "user");
