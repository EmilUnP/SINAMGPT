"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Radio,
  Server,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminPanelCard,
  AdminStatCard,
  AdminStatGrid,
  adminBtnGhost,
  adminFieldClass,
} from "@/components/AdminChrome";

type LiveRow = {
  id: string;
  source: "user" | "guest";
  username: string;
  model: string;
  promptPreview: string;
  promptChars: number;
  responseChars: number;
  elapsedMs: number;
  ttftMs: number | null;
  status: "streaming";
};

type RecentRow = {
  id: string;
  source: "user" | "guest";
  username: string;
  model: string;
  prompt_preview: string;
  prompt_chars: number;
  response_chars: number;
  ttft_ms: number | null;
  duration_ms: number;
  tokens_eval: number | null;
  tokens_prompt: number | null;
  tokens_per_sec: number | null;
  status: "ok" | "error" | "aborted";
  error_message: string | null;
  created_at: string;
};

type RecentPage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type UsagePayload = {
  live: LiveRow[];
  recent: RecentRow[];
  recentPage: RecentPage;
  analytics: {
    summary: Record<string, number | null>;
    byModel: Array<{
      model: string;
      requests: number;
      avg_duration_ms: number | null;
      avg_tokens_per_sec: number | null;
      response_chars: number;
    }>;
    byHour: Array<{
      hour: string;
      requests: number;
      avg_duration_ms: number | null;
    }>;
    topUsers: Array<{
      username: string;
      source: "user" | "guest";
      requests: number;
      avg_duration_ms: number | null;
    }>;
  };
  ollama: {
    ok: boolean;
    latencyMs: number;
    error?: string;
    backend?: string;
  };
  backends?: Array<{
    backend: "ollama" | "vllm";
    ok: boolean;
    latencyMs: number;
    error?: string;
    baseUrl?: string;
  }>;
  serverTime: string;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const fmtMs = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
};

const fmtNum = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
};

const fmtTime = (value: string) => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const statusTone = (status: string) => {
  if (status === "ok" || status === "streaming") {
    return "status-pill status-ok";
  }
  if (status === "error") return "status-pill status-bad";
  return "status-pill status-warn";
};

export const AdminUsagePanel = () => {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    25,
  );

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      const res = await fetch(`/api/admin/usage?${params}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as UsagePayload & { error?: string };
      if (!res.ok) {
        setError(json.error || "Failed to load usage");
        return;
      }
      setData(json);
      if (json.recentPage?.page && json.recentPage.page !== page) {
        setPage(json.recentPage.page);
      }
      setError("");
    } catch {
      setError("Network error loading usage");
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = data?.analytics.summary;
  const recentPage = data?.recentPage;
  const totalPages = recentPage?.totalPages ?? 1;
  const totalRows = recentPage?.total ?? 0;
  const rangeStart =
    totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRows);
  const maxHour = Math.max(
    1,
    ...(data?.analytics.byHour.map((h) => h.requests) ?? [1]),
  );

  const handlePageSizeChange = (next: (typeof PAGE_SIZE_OPTIONS)[number]) => {
    setPageSize(next);
    setPage(1);
  };

  return (
    <div className="space-y-4 animate-fade-up">
      {error ? (
        <p className="rounded-2xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-4 py-2.5 text-sm text-[var(--status-bad-fg)]">
          {error}
        </p>
      ) : null}

      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={Activity}
            title="Live usage"
            description="Auto-refreshes every 3s — speed, load, and request history across backends."
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                {(data?.backends?.length
                  ? data.backends
                  : data?.ollama
                    ? [
                        {
                          backend: "ollama" as const,
                          ok: data.ollama.ok,
                          latencyMs: data.ollama.latencyMs,
                          error: data.ollama.error,
                        },
                      ]
                    : []
                ).map((b) => (
                  <span
                    key={b.backend}
                    className={`status-pill ${b.ok ? "status-ok" : "status-bad"}`}
                  >
                    <Server size={12} />
                    {b.backend === "vllm" ? "vLLM" : "Ollama"}{" "}
                    {b.ok ? "online" : "down"} · {fmtMs(b.latencyMs)}
                  </span>
                ))}
                <span className="status-pill status-info">
                  <Radio
                    size={12}
                    className={data?.live.length ? "animate-pulse" : ""}
                  />
                  {data?.live.length ?? 0} live
                </span>
              </div>
            }
          />

          <AdminStatGrid>
            <AdminStatCard
              label="Requests today"
              value={isLoading && !data ? "…" : fmtNum(summary?.requests_today)}
              hint={`${fmtNum(summary?.requests_24h)} last 24h`}
              tone="info"
            />
            <AdminStatCard
              label="Avg response"
              value={
                isLoading && !data
                  ? "…"
                  : fmtMs(summary?.avg_duration_ms ?? null)
              }
              hint={`First token ${fmtMs(summary?.avg_ttft_ms ?? null)}`}
            />
            <AdminStatCard
              label="Avg speed"
              value={
                isLoading && !data
                  ? "…"
                  : summary?.avg_tokens_per_sec != null
                    ? `${summary.avg_tokens_per_sec} t/s`
                    : "—"
              }
              hint={`${fmtNum(summary?.total_requests)} all-time`}
            />
            <AdminStatCard
              label="Errors"
              value={isLoading && !data ? "…" : fmtNum(summary?.error_requests)}
              hint={`Guest ${fmtNum(summary?.guest_requests)} · User ${fmtNum(summary?.user_requests)}`}
              tone={
                (summary?.error_requests ?? 0) > 0 ? "bad" : "default"
              }
            />
          </AdminStatGrid>
        </div>
      </AdminPanelCard>

      <AdminPanelCard>
        <div className="border-b border-[var(--admin-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            Live process
          </h3>
          <p className="text-xs text-[var(--admin-muted)]">
            Generations streaming right now
          </p>
        </div>
        {data?.live.length ? (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Model</th>
                  <th>Prompt</th>
                  <th>Elapsed</th>
                  <th>TTFT</th>
                  <th>Out chars</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.live.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="font-medium text-[var(--admin-fg)]">
                        {row.username}
                      </span>
                      <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                        {row.source}
                      </span>
                    </td>
                    <td className="text-[var(--admin-fg)]">{row.model}</td>
                    <td className="max-w-[220px] truncate text-[var(--admin-muted)]">
                      {row.promptPreview}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.elapsedMs)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.ttftMs)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {row.responseChars}
                    </td>
                    <td>
                      <span className={statusTone(row.status)}>streaming</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
            No active generations right now. Send a chat to see live process.
          </p>
        )}
      </AdminPanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            Last 24 hours
          </h3>
          <p className="mb-4 text-xs text-[var(--admin-muted)]">
            Requests per hour
          </p>
          {data?.analytics.byHour.length ? (
            <div className="flex h-36 items-end gap-1">
              {data.analytics.byHour.map((bucket) => (
                <div
                  key={bucket.hour}
                  className="admin-bar group relative flex-1 rounded-t"
                  style={{
                    height: `${Math.max(8, (bucket.requests / maxHour) * 100)}%`,
                  }}
                  title={`${bucket.hour}: ${bucket.requests} req · avg ${fmtMs(bucket.avg_duration_ms)}`}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-[var(--admin-muted)]">
              No usage in the last 24 hours yet.
            </p>
          )}
        </AdminPanelCard>

        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            By model
          </h3>
          <p className="mb-3 text-xs text-[var(--admin-muted)]">
            Volume and average speed
          </p>
          <div className="space-y-2">
            {(data?.analytics.byModel ?? []).length ? (
              data?.analytics.byModel.map((row) => (
                <div
                  key={row.model}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--admin-fg)]">
                      {row.model}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      {row.requests} req · avg {fmtMs(row.avg_duration_ms)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums text-[var(--admin-fg)]">
                    {row.avg_tokens_per_sec != null
                      ? `${row.avg_tokens_per_sec} t/s`
                      : "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[var(--admin-muted)]">
                Model stats appear after the first chats.
              </p>
            )}
          </div>
        </AdminPanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            Top users
          </h3>
          <div className="mt-3 space-y-2">
            {(data?.analytics.topUsers ?? []).length ? (
              data?.analytics.topUsers.map((row) => (
                <div
                  key={`${row.source}-${row.username}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--admin-fg)]">
                      {row.username}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      {row.source}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[var(--admin-fg)]">
                    <p className="tabular-nums">{row.requests} req</p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      avg {fmtMs(row.avg_duration_ms)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[var(--admin-muted)]">
                No user usage yet.
              </p>
            )}
          </div>
        </AdminPanelCard>

        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            Throughput totals
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              {
                label: "Prompt chars",
                value: fmtNum(summary?.total_prompt_chars),
              },
              {
                label: "Response chars",
                value: fmtNum(summary?.total_response_chars),
              },
              {
                label: "Success rate",
                value: summary?.total_requests
                  ? `${Math.round(((summary.ok_requests ?? 0) / summary.total_requests) * 100)}%`
                  : "—",
              },
              {
                label: "7-day volume",
                value: fmtNum(summary?.requests_7d),
              },
            ].map((cell) => (
              <div
                key={cell.label}
                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-3"
              >
                <p className="text-xs text-[var(--admin-muted)]">{cell.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--admin-fg)]">
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </AdminPanelCard>
      </div>

      <AdminPanelCard>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
              Past usage
            </h3>
            <p className="text-xs text-[var(--admin-muted)]">
              AI calls with duration and speed
              {totalRows
                ? ` · showing ${rangeStart}–${rangeEnd} of ${totalRows}`
                : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
            Rows
            <select
              value={pageSize}
              onChange={(e) =>
                handlePageSizeChange(
                  Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                )
              }
              className={`${adminFieldClass} mt-0 w-auto py-1.5`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Model</th>
                <th>Prompt</th>
                <th>TTFT</th>
                <th>Total</th>
                <th>Speed</th>
                <th>Tokens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).length ? (
                data?.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-[var(--admin-muted)]">
                      {fmtTime(row.created_at)}
                    </td>
                    <td>
                      <span className="font-medium text-[var(--admin-fg)]">
                        {row.username}
                      </span>
                      <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                        {row.source}
                      </span>
                    </td>
                    <td className="text-[var(--admin-fg)]">{row.model}</td>
                    <td className="max-w-[200px] truncate text-[var(--admin-muted)]">
                      {row.prompt_preview}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.ttft_ms)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.duration_ms)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {row.tokens_per_sec != null
                        ? `${row.tokens_per_sec} t/s`
                        : "—"}
                    </td>
                    <td className="text-[var(--admin-muted)]">
                      {row.tokens_eval != null
                        ? `${row.tokens_prompt ?? "—"}→${row.tokens_eval}`
                        : `${row.prompt_chars}/${row.response_chars}c`}
                    </td>
                    <td>
                      <span className={statusTone(row.status)}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="!border-0 px-4 py-10 text-center text-[var(--admin-muted)]"
                  >
                    {isLoading
                      ? "Loading usage…"
                      : "No past usage yet. Chat once, then refresh this tab."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
          <p className="text-xs text-[var(--admin-muted)]">
            Page {Math.min(page, totalPages)} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={adminBtnGhost}
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={adminBtnGhost}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </AdminPanelCard>
    </div>
  );
};
