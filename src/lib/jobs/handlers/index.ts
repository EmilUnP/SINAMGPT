import type { JobHandler } from "../types";
import { demoSleepHandler } from "./demo-sleep";

const handlers = new Map<string, JobHandler>([
  ["demo.sleep", demoSleepHandler],
]);

export const getJobHandler = (kind: string): JobHandler | null =>
  handlers.get(kind) ?? null;

export const hasJobHandler = (kind: string): boolean => handlers.has(kind);
