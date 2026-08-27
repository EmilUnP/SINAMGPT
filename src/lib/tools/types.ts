import type { AnySchema } from "ajv";
import type {
  ChatMessage,
  LlmCompletion,
  LlmToolDefinition,
} from "@/lib/llm";
import type { ToolTraceEntry } from "@/lib/types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolContext = {
  signal: AbortSignal;
};

export type ToolDefinition<
  TInput extends JsonValue = JsonValue,
  TResult extends JsonValue = JsonValue,
> = {
  name: string;
  description: string;
  inputSchema: AnySchema;
  resultSchema: AnySchema;
  handler: (input: TInput, context: ToolContext) => Promise<TResult>;
};

export type ToolPayloadGuard = (
  serializedPayload: string,
  direction: "input" | "output",
  toolName: string,
) => Promise<{ blocked: boolean; reason?: string }>;

export type ToolCompletion = (
  messages: ChatMessage[],
  options: {
    tools?: LlmToolDefinition[];
    signal: AbortSignal;
  },
) => Promise<LlmCompletion>;

export type ToolLoopOptions = {
  messages: ChatMessage[];
  registry: import("./registry").ToolRegistry;
  complete: ToolCompletion;
  inspectPayload: ToolPayloadGuard;
  signal?: AbortSignal;
  maxIterations?: number;
  callTimeoutMs?: number;
};

export type ToolLoopResult = {
  content: string;
  messages: ChatMessage[];
  trace: ToolTraceEntry[];
  reachedCap: boolean;
};
