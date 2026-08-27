import { getCurrentUser } from "@/lib/auth";
import { getOwnedJob } from "@/lib/jobs";
import { SSE_HEADERS, startSseKeepalive } from "@/lib/sse";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

export async function GET(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const initial = getOwnedJob(id, user.id);
  if (!initial) return Response.json({ error: "Job not found" }, { status: 404 });

  const encoder = new TextEncoder();
  let timer: NodeJS.Timeout | null = null;
  let stopKeepalive: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const close = () => {
        if (timer) clearInterval(timer);
        stopKeepalive?.();
        try {
          controller.close();
        } catch {
          // Client already disconnected.
        }
      };
      const emit = () => {
        const job = getOwnedJob(id, user.id);
        if (!job) {
          send("error", { error: "Job not found" });
          close();
          return;
        }
        if (job.status === "completed") {
          send("done", { job });
          close();
          return;
        }
        if (job.status === "failed") {
          send("error", { job, error: job.error || "Job failed" });
          close();
          return;
        }
        if (job.status === "cancelled") {
          send("cancelled", { job });
          close();
          return;
        }
        send("progress", { job });
      };

      send("meta", { job: initial });
      if (
        initial.status === "completed" ||
        initial.status === "failed" ||
        initial.status === "cancelled"
      ) {
        emit();
        return;
      }
      stopKeepalive = startSseKeepalive(controller, encoder);
      timer = setInterval(emit, 500);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      if (timer) clearInterval(timer);
      stopKeepalive?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
