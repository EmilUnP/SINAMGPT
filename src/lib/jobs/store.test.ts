import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimNextJob,
  createJob,
  getJob,
  recoverStaleJobs,
  requestJobCancellation,
} from "./store";

let database: Database.Database;

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0,
      progress_message TEXT NOT NULL DEFAULT '', input_json TEXT NOT NULL DEFAULT '{}',
      result_ref TEXT, error TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0,
      worker_id TEXT, lease_expires_at TEXT, started_at TEXT, finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
});

afterEach(() => database.close());

describe("job store", () => {
  it("creates and atomically claims a queued job", () => {
    const created = createJob(
      { userId: "user-1", kind: "demo.sleep", payload: { steps: 2 } },
      database,
    );
    expect(created.status).toBe("queued");

    const claimed = claimNextJob("worker-1", database);
    expect(claimed).toMatchObject({
      id: created.id,
      status: "running",
      worker_id: "worker-1",
    });
    expect(claimNextJob("worker-2", database)).toBeNull();
  });

  it("enforces ownership when cancelling", () => {
    const job = createJob({ userId: "owner", kind: "demo.sleep" }, database);
    expect(requestJobCancellation(job.id, "other", database)).toBeNull();
    expect(getJob(job.id, database)?.status).toBe("queued");
    expect(requestJobCancellation(job.id, "owner", database)).toMatchObject({
      status: "cancelled",
      cancel_requested: 1,
    });
  });

  it("recovers an expired running lease", () => {
    const job = createJob({ userId: "owner", kind: "demo.sleep" }, database);
    claimNextJob("dead-worker", database);
    database
      .prepare(`UPDATE jobs SET lease_expires_at = datetime('now', '-1 minute')`)
      .run();

    expect(recoverStaleJobs(database)).toBe(1);
    expect(getJob(job.id, database)).toMatchObject({
      status: "queued",
      worker_id: null,
    });
  });

  it("caps unfinished jobs per user", () => {
    for (let index = 0; index < 5; index += 1) {
      createJob({ userId: "owner", kind: "demo.sleep" }, database);
    }
    expect(() =>
      createJob({ userId: "owner", kind: "demo.sleep" }, database),
    ).toThrow("maximum of 5");
  });
});
