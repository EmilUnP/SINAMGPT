import { randomBytes } from "crypto";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { JobRecord } from "./types";

type Db = Database.Database;

const newJobId = (): string => randomBytes(16).toString("hex");

const clampProgress = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

export const createJob = (
  input: { userId: string; kind: string; payload?: unknown },
  database: Db = getDb(),
): JobRecord => {
  const queued = database
    .prepare(
      `SELECT COUNT(*) AS count FROM jobs
       WHERE user_id = ? AND status IN ('queued', 'running')`,
    )
    .get(input.userId) as { count: number };
  if (queued.count >= 5) {
    throw new Error("You already have the maximum of 5 queued jobs.");
  }

  const id = newJobId();
  const payload = JSON.stringify(input.payload ?? {});
  if (payload.length > 32_000) throw new Error("Job input is too large.");
  database
    .prepare(
      `INSERT INTO jobs (id, user_id, kind, input_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(id, input.userId, input.kind, payload);
  return getJob(id, database)!;
};

export const getJob = (
  id: string,
  database: Db = getDb(),
): JobRecord | null =>
  (database.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as
    | JobRecord
    | undefined) ?? null;

export const getOwnedJob = (
  id: string,
  userId: string,
  database: Db = getDb(),
): JobRecord | null =>
  (database
    .prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`)
    .get(id, userId) as JobRecord | undefined) ?? null;

export const listOwnedJobs = (
  userId: string,
  limit = 50,
  database: Db = getDb(),
): JobRecord[] =>
  database
    .prepare(
      `SELECT * FROM jobs WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, Math.max(1, Math.min(100, Math.floor(limit)))) as JobRecord[];

export const requestJobCancellation = (
  id: string,
  userId: string,
  database: Db = getDb(),
): JobRecord | null => {
  database
    .prepare(
      `UPDATE jobs SET
         cancel_requested = 1,
         status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
         finished_at = CASE
           WHEN status = 'queued' THEN datetime('now')
           ELSE finished_at
         END,
         updated_at = datetime('now')
       WHERE id = ? AND user_id = ?
         AND status IN ('queued', 'running')`,
    )
    .run(id, userId);
  return getOwnedJob(id, userId, database);
};

export const recoverStaleJobs = (database: Db = getDb()): number =>
  database
    .prepare(
      `UPDATE jobs SET
         status = 'queued',
         worker_id = NULL,
         lease_expires_at = NULL,
         progress_message = 'Recovered after worker restart',
         updated_at = datetime('now')
       WHERE status = 'running'
         AND (lease_expires_at IS NULL OR lease_expires_at < datetime('now'))`,
    )
    .run().changes;

export const claimNextJob = (
  workerId: string,
  database: Db = getDb(),
): JobRecord | null =>
  database.transaction(() => {
    const next = database
      .prepare(
        `SELECT id FROM jobs
         WHERE status = 'queued' AND cancel_requested = 0
         ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    if (!next) return null;
    const changed = database
      .prepare(
        `UPDATE jobs SET
           status = 'running',
           worker_id = ?,
           lease_expires_at = datetime('now', '+30 seconds'),
           started_at = COALESCE(started_at, datetime('now')),
           updated_at = datetime('now')
         WHERE id = ? AND status = 'queued' AND cancel_requested = 0`,
      )
      .run(workerId, next.id);
    return changed.changes === 1 ? getJob(next.id, database) : null;
  })();

export const renewJobLease = (
  id: string,
  workerId: string,
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET lease_expires_at = datetime('now', '+30 seconds'),
       updated_at = datetime('now')
       WHERE id = ? AND worker_id = ? AND status = 'running'`,
    )
    .run(id, workerId);
};

export const updateJobProgress = (
  id: string,
  workerId: string,
  progress: number,
  message = "",
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET progress = ?, progress_message = ?,
       updated_at = datetime('now')
       WHERE id = ? AND worker_id = ? AND status = 'running'`,
    )
    .run(clampProgress(progress), message.slice(0, 500), id, workerId);
};

export const isJobCancellationRequested = (
  id: string,
  database: Db = getDb(),
): boolean => {
  const row = database
    .prepare(`SELECT cancel_requested FROM jobs WHERE id = ?`)
    .get(id) as { cancel_requested: number } | undefined;
  return row?.cancel_requested === 1;
};

export const completeJob = (
  id: string,
  workerId: string,
  resultRef: string | null,
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET status = 'completed', progress = 100,
       result_ref = ?, error = NULL, lease_expires_at = NULL,
       finished_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND worker_id = ? AND status = 'running'`,
    )
    .run(resultRef?.slice(0, 1000) ?? null, id, workerId);
};

export const finishCancelledJob = (
  id: string,
  workerId: string,
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET status = 'cancelled', lease_expires_at = NULL,
       finished_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND worker_id = ? AND status = 'running'`,
    )
    .run(id, workerId);
};

export const failJob = (
  id: string,
  workerId: string,
  error: string,
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET status = 'failed', error = ?,
       lease_expires_at = NULL, finished_at = datetime('now'),
       updated_at = datetime('now')
       WHERE id = ? AND worker_id = ? AND status = 'running'`,
    )
    .run(error.slice(0, 2000), id, workerId);
};

export const requeueWorkerJobs = (
  workerId: string,
  database: Db = getDb(),
): void => {
  database
    .prepare(
      `UPDATE jobs SET status = 'queued', worker_id = NULL,
       lease_expires_at = NULL, updated_at = datetime('now')
       WHERE worker_id = ? AND status = 'running'`,
    )
    .run(workerId);
};
