import { checkToolPayloadGuardrails } from "@/lib/guardrails";
import type { ToolPayloadGuard } from "./types";

/** Default local-only guard used for every serialized tool input and output. */
export const inspectToolPayload: ToolPayloadGuard = async (
  serializedPayload,
) => checkToolPayloadGuardrails(serializedPayload, "user");
