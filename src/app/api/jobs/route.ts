import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/features";
import { createJob, ensureJobWorker, listOwnedJobs } from "@/lib/jobs";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  kind: z.literal("demo.sleep"),
  input: z
    .object({
      durationMs: z.number().int().min(1_000).max(240_000).optional(),
      steps: z.number().int().min(1).max(120).optional(),
    })
    .strict()
    .optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return NextResponse.json({ jobs: listOwnedJobs(user.id, limit) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isFeatureEnabled("jobQueue")) {
    return NextResponse.json(
      { error: "The internal job queue API is disabled." },
      { status: 403 },
    );
  }

  const rate = takeRateLimit(`jobs:${admin.id}:${clientIp(request)}`, 10, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many job requests." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid job" },
      { status: 400 },
    );
  }

  try {
    ensureJobWorker();
    const job = createJob({
      userId: admin.id,
      kind: parsed.data.kind,
      payload: parsed.data.input,
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create job" },
      { status: 400 },
    );
  }
}
