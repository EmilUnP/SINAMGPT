import { randomBytes } from "crypto";
import { getJobHandler } from "./handlers";
import {
  claimNextJob,
  completeJob,
  failJob,
  finishCancelledJob,
  isJobCancellationRequested,
  recoverStaleJobs,
  renewJobLease,
  requeueWorkerJobs,
  updateJobProgress,
} from "./store";
import type { JobRecord } from "./types";

type WorkerState = {
  id: string;
  timer: NodeJS.Timeout;
  isRunning: boolean;
  isStopping: boolean;
};

declare global {
  var __sinamgptJobWorker: WorkerState | undefined;
}

const runJob = async (job: JobRecord, worker: WorkerState): Promise<void> => {
  const handler = getJobHandler(job.kind);
  if (!handler) {
    failJob(job.id, worker.id, `No handler is registered for "${job.kind}".`);
    return;
  }

  const abort = new AbortController();
  const heartbeat = setInterval(() => renewJobLease(job.id, worker.id), 10_000);
  heartbeat.unref();
  try {
    const result = await handler(JSON.parse(job.input_json), {
      signal: abort.signal,
      reportProgress: (progress, message) =>
        updateJobProgress(job.id, worker.id, progress, message),
      isCancellationRequested: () => {
        const cancelled =
          worker.isStopping || isJobCancellationRequested(job.id);
        if (cancelled) abort.abort();
        return cancelled;
      },
    });
    if (isJobCancellationRequested(job.id) || abort.signal.aborted) {
      finishCancelledJob(job.id, worker.id);
      return;
    }
    completeJob(job.id, worker.id, result?.resultRef ?? null);
  } catch (error) {
    if (
      abort.signal.aborted ||
      isJobCancellationRequested(job.id) ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      finishCancelledJob(job.id, worker.id);
    } else {
      failJob(
        job.id,
        worker.id,
        error instanceof Error ? error.message : "Job failed",
      );
    }
  } finally {
    clearInterval(heartbeat);
  }
};

const pump = async (worker: WorkerState): Promise<void> => {
  if (worker.isRunning || worker.isStopping) return;
  worker.isRunning = true;
  try {
    const job = claimNextJob(worker.id);
    if (job) await runJob(job, worker);
  } finally {
    worker.isRunning = false;
  }
};

export const startJobWorker = (): WorkerState => {
  if (globalThis.__sinamgptJobWorker) return globalThis.__sinamgptJobWorker;

  recoverStaleJobs();
  const worker: WorkerState = {
    id: randomBytes(8).toString("hex"),
    timer: undefined as unknown as NodeJS.Timeout,
    isRunning: false,
    isStopping: false,
  };
  worker.timer = setInterval(() => void pump(worker), 500);
  worker.timer.unref();
  globalThis.__sinamgptJobWorker = worker;

  const stop = () => stopJobWorker();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return worker;
};

export const stopJobWorker = (): void => {
  const worker = globalThis.__sinamgptJobWorker;
  if (!worker) return;
  worker.isStopping = true;
  clearInterval(worker.timer);
  requeueWorkerJobs(worker.id);
  globalThis.__sinamgptJobWorker = undefined;
};

export const ensureJobWorker = (): void => {
  if (process.env.NEXT_RUNTIME === "edge") return;
  startJobWorker();
};
