import { ToolRegistry } from "./registry";

/**
 * P0.6 intentionally ships no executable tools. Registrations must be added
 * here in code and pass ToolRegistry validation before they become available.
 */
export const toolRegistry = new ToolRegistry([]);
export const registeredTools = toolRegistry.list();
