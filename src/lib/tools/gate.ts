import { inferCapabilities } from "@/lib/llm/capabilities";
import { modelSupportsTools } from "@/lib/settings";
import { getActiveToolRegistry } from "./bootstrap";

/**
 * Search tools run when Admin search is on and the model can take tools —
 * including name heuristics when Ollama did not advertise a tools flag.
 */
export const shouldUseToolRuntime = (model: string): boolean =>
  getActiveToolRegistry().size > 0 &&
  (modelSupportsTools(model) || inferCapabilities(model).tools);
