export type ToolSseEvent =
  | {
      event: "tool_start";
      data: { callId: string; toolName: string };
    }
  | {
      event: "tool_end";
      data: {
        callId: string;
        toolName: string;
        status: string;
        durationMs: number;
      };
    };

/** Uses the chat route's existing SSE wire format; clients may ignore events. */
export const encodeToolSseEvent = (event: ToolSseEvent): Uint8Array =>
  new TextEncoder().encode(
    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
  );
