/**
 * SSE helpers for chat streams.
 *
 * Large models (Llama 4 Scout ~100B) can spend 1–2 minutes on prompt eval
 * before the first token. If the HTTP response does not start until then,
 * browsers / reverse proxies idle-timeout and the UI shows an error even
 * though Ollama later finishes (usage stays "ok").
 *
 * Open the SSE immediately, send meta, then keep the socket alive with
 * comments until tokens arrive.
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** Self-hosted Node has no Vercel cap; this covers long Scout/Maverick waits. */
export const CHAT_MAX_DURATION_SEC = 300;

const KEEPALIVE_MS = 10_000;

export const startSseKeepalive = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): (() => void) => {
  const timer = setInterval(() => {
    try {
      controller.enqueue(encoder.encode(": keepalive\n\n"));
    } catch {
      clearInterval(timer);
    }
  }, KEEPALIVE_MS);
  return () => clearInterval(timer);
};
