/**
 * Compatibility shim — prefer `@/lib/llm`.
 * Kept so existing imports (`@/lib/ollama`) keep working.
 */
export {
  completeChat,
  getDefaultModel,
  listModels,
  streamChat,
  type ChatMessage,
  type ChatOptions,
  type LlmModel as OllamaModel,
} from "@/lib/llm";
