export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type JobRecord = {
  id: string;
  user_id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  progress_message: string;
  input_json: string;
  result_ref: string | null;
  error: string | null;
  cancel_requested: number;
  worker_id: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobHandlerContext = {
  signal: AbortSignal;
  reportProgress: (progress: number, message?: string) => void;
  isCancellationRequested: () => boolean;
};

export type JobHandler = (
  input: unknown,
  context: JobHandlerContext,
) => Promise<{ resultRef?: string | null } | void>;
