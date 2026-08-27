import { isFeatureEnabled } from "@/lib/features";
import { modelSupportsTools } from "@/lib/settings";
import { registeredTools } from "./bootstrap";

/** All three gates are required; P0.6 bootstrap keeps the first one false. */
export const shouldUseToolRuntime = (model: string): boolean =>
  registeredTools.length > 0 &&
  modelSupportsTools(model) &&
  isFeatureEnabled("toolCalling");
