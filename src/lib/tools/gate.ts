import { modelSupportsTools } from "@/lib/settings";
import { getActiveToolRegistry } from "./bootstrap";

/**
 * Search tools run when Admin search is on and the catalog says the model can
 * take tools. The catalog is synced from the provider, so it is the truth —
 * a name heuristic here would re-enable tools the runtime already denied and
 * push a model like gemma3 into a loop it cannot complete.
 */
export const shouldUseToolRuntime = (model: string): boolean =>
  getActiveToolRegistry().size > 0 && modelSupportsTools(model);
