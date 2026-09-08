import { createSearchTools } from "@/lib/search/tools";
import { isWebSearchEnabled } from "@/lib/search/settings";
import { ToolRegistry } from "./registry";

const emptyRegistry = new ToolRegistry([]);

/**
 * Search tools are registered only while Admin internet search is on.
 * Default-off keeps the loop gated shut, same as the empty P0.6 registry.
 */
export const getActiveToolRegistry = (): ToolRegistry => {
  if (!isWebSearchEnabled()) return emptyRegistry;
  return new ToolRegistry(createSearchTools());
};

/** Snapshot for tests and imports that still expect an empty default. */
export const toolRegistry = emptyRegistry;
export const registeredTools = emptyRegistry.list();
