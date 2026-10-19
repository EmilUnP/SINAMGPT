/** Model-supplied text; keep the wire payload small and bounded. */
export const MAX_ACTIVITY_LABEL_CHARS = 120;
export const MAX_ACTIVITY_SITES = 6;
export const MAX_ACTIVITY_SITE_CHARS = 80;

export type ToolSseEvent =
  | {
      event: "tool_start";
      data: { callId: string; toolName: string; label?: string };
    }
  | {
      event: "tool_progress";
      data: {
        callId: string;
        toolName: string;
        stage: string;
        label?: string;
        sites?: string[];
      };
    }
  | {
      event: "tool_end";
      data: {
        callId: string;
        toolName: string;
        status: string;
        durationMs: number;
        sites?: string[];
      };
    };

export const boundActivityLabel = (value: string): string | undefined => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > MAX_ACTIVITY_LABEL_CHARS
    ? `${clean.slice(0, MAX_ACTIVITY_LABEL_CHARS - 1)}…`
    : clean;
};

export const boundActivitySites = (values: string[]): string[] | undefined => {
  const seen = new Set<string>();
  for (const raw of values) {
    const site = raw.replace(/\s+/g, "").trim().slice(0, MAX_ACTIVITY_SITE_CHARS);
    if (site) seen.add(site);
    if (seen.size >= MAX_ACTIVITY_SITES) break;
  }
  return seen.size ? [...seen] : undefined;
};

/** Uses the chat route's existing SSE wire format; clients may ignore events. */
export const encodeToolSseEvent = (event: ToolSseEvent): Uint8Array =>
  new TextEncoder().encode(
    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
  );
