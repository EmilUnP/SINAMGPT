"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Radio,
  Server,
  Timer,
  Zap,
} from "lucide-react";

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
    return "bg-emerald-500/15 text-emerald-200";
  }
  if (status === "error") return "bg-red-500/15 text-red-200";
  return "bg-amber-500/15 text-amber-200";
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
    <div className="space-y-5 animate-fade-up">
      {error ? (
        <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Live AI usage & performance</h2>
          <p className="text-xs text-sky-200/45">
            Auto-refreshes every 3s · real speed, load, and history
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
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
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                b.ok
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "bg-red-500/15 text-red-200"
              }`}
            >
              <Server size={12} />
              {b.backend === "vllm" ? "vLLM" : "Ollama"}{" "}
              {b.ok ? "online" : "down"} · {fmtMs(b.latencyMs)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-100">
            <Radio size={12} className={data?.live.length ? "animate-pulse" : ""} />
            {data?.live.length ?? 0} live
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Requests today",
            value: fmtNum(summary?.requests_today),
            icon: Activity,
          },
          {
            label: "Avg response",
            value: fmtMs(summary?.avg_duration_ms ?? null),
            icon: Timer,
          },
          {
            label: "Avg first token",
            value: fmtMs(summary?.avg_ttft_ms ?? null),
            icon: Zap,
          },
          {
            label: "Avg speed",
            value:
              summary?.avg_tokens_per_sec != null
                ? `${summary.avg_tokens_per_sec} t/s`
                : "—",
            icon: Gauge,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 px-4 py-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-sky-200/45">{card.label}</p>
              <card.icon size={14} className="text-sky-400/70" />
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {isLoading && !data ? "…" : card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "All-time requests", value: fmtNum(summary?.total_requests) },
          { label: "Last 24h", value: fmtNum(summary?.requests_24h) },
          { label: "Guest / User", value: `${fmtNum(summary?.guest_requests)} / ${fmtNum(summary?.user_requests)}` },
          { label: "Errors", value: fmtNum(summary?.error_requests) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/70 px-4 py-3"
          >
            <p className="text-xs text-sky-200/45">{card.label}</p>
            <p className="mt-1 text-lg font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80">
        <div className="border-b border-sky-400/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Live process</h3>
          <p className="text-xs text-sky-200/45">
            Requests currently streaming from Ollama right now
          </p>
        </div>
        {data?.live.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-sky-500/[0.04] text-xs uppercase tracking-wide text-sky-200/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Prompt</th>
                  <th className="px-4 py-3 font-medium">Elapsed</th>
                  <th className="px-4 py-3 font-medium">TTFT</th>
                  <th className="px-4 py-3 font-medium">Out chars</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.live.map((row) => (
                  <tr key={row.id} className="border-t border-sky-400/10">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.username}</span>
                      <span className="ml-2 text-[11px] text-sky-200/40">
                        {row.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sky-100/80">{row.model}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-sky-200/55">
                      {row.promptPreview}
                    </td>
                    <td className="px-4 py-3">{fmtMs(row.elapsedMs)}</td>
                    <td className="px-4 py-3">{fmtMs(row.ttftMs)}</td>
                    <td className="px-4 py-3">{row.responseChars}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusTone(row.status)}`}
                      >
                        streaming
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-sky-200/45">
            No active generations right now. Send a chat to see live process.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
          <h3 className="text-sm font-semibold">Last 24 hours</h3>
          <p className="mb-4 text-xs text-sky-200/45">Requests per hour</p>
          {data?.analytics.byHour.length ? (
            <div className="flex h-36 items-end gap-1">
              {data.analytics.byHour.map((bucket) => (
                <div
                  key={bucket.hour}
                  className="group relative flex-1 rounded-t bg-gradient-to-t from-blue-600/80 to-sky-400/80"
                  style={{
                    height: `${Math.max(8, (bucket.requests / maxHour) * 100)}%`,
                  }}
                  title={`${bucket.hour}: ${bucket.requests} req · avg ${fmtMs(bucket.avg_duration_ms)}`}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-sky-200/45">
              No usage in the last 24 hours yet.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
          <h3 className="text-sm font-semibold">By model</h3>
          <p className="mb-3 text-xs text-sky-200/45">
            Volume and average speed
          </p>
          <div className="space-y-2">
            {(data?.analytics.byModel ?? []).length ? (
              data?.analytics.byModel.map((row) => (
                <div
                  key={row.model}
                  className="flex items-center justify-between gap-3 rounded-xl border border-sky-400/10 bg-sky-500/[0.04] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.model}</p>
                    <p className="text-[11px] text-sky-200/45">
                      {row.requests} req · avg {fmtMs(row.avg_duration_ms)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-sky-100">
                    {row.avg_tokens_per_sec != null
                      ? `${row.avg_tokens_per_sec} t/s`
                      : "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-sky-200/45">
                Model stats appear after the first chats.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
          <h3 className="text-sm font-semibold">Top users</h3>
          <div className="mt-3 space-y-2">
            {(data?.analytics.topUsers ?? []).length ? (
              data?.analytics.topUsers.map((row) => (
                <div
                  key={`${row.source}-${row.username}`}
                  className="flex items-center justify-between rounded-xl border border-sky-400/10 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{row.username}</p>
                    <p className="text-[11px] text-sky-200/45">{row.source}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>{row.requests} req</p>
                    <p className="text-[11px] text-sky-200/45">
                      avg {fmtMs(row.avg_duration_ms)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-sky-200/45">
                No user usage yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
          <h3 className="text-sm font-semibold">Throughput totals</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-sky-400/10 px-3 py-3">
              <p className="text-xs text-sky-200/45">Prompt chars</p>
              <p className="mt-1 text-lg font-semibold">
                {fmtNum(summary?.total_prompt_chars)}
              </p>
            </div>
            <div className="rounded-xl border border-sky-400/10 px-3 py-3">
              <p className="text-xs text-sky-200/45">Response chars</p>
              <p className="mt-1 text-lg font-semibold">
                {fmtNum(summary?.total_response_chars)}
              </p>
            </div>
            <div className="rounded-xl border border-sky-400/10 px-3 py-3">
              <p className="text-xs text-sky-200/45">Success rate</p>
              <p className="mt-1 text-lg font-semibold">
                {summary?.total_requests
                  ? `${Math.round(((summary.ok_requests ?? 0) / summary.total_requests) * 100)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-sky-400/10 px-3 py-3">
              <p className="text-xs text-sky-200/45">7-day volume</p>
              <p className="mt-1 text-lg font-semibold">
                {fmtNum(summary?.requests_7d)}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Past usage</h3>
            <p className="text-xs text-sky-200/45">
              AI calls with real duration and speed
              {totalRows
                ? ` · showing ${rangeStart}–${rangeEnd} of ${totalRows}`
                : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-sky-200/55">
            Rows
            <select
              value={pageSize}
              onChange={(e) =>
                handlePageSizeChange(
                  Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                )
              }
              className="rounded-lg border border-sky-400/15 bg-[#0a1220] px-2 py-1.5 text-sky-100 outline-none focus:border-sky-400/40"
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
          <table className="min-w-full text-left text-sm">
            <thead className="bg-sky-500/[0.04] text-xs uppercase tracking-wide text-sky-200/45">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Prompt</th>
                <th className="px-4 py-3 font-medium">TTFT</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Speed</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).length ? (
                data?.recent.map((row) => (
                  <tr key={row.id} className="border-t border-sky-400/10">
                    <td className="whitespace-nowrap px-4 py-3 text-sky-200/55">
                      {fmtTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.username}</span>
                      <span className="ml-2 text-[11px] text-sky-200/40">
                        {row.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sky-100/80">{row.model}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-sky-200/55">
                      {row.prompt_preview}
                    </td>
                    <td className="px-4 py-3">{fmtMs(row.ttft_ms)}</td>
                    <td className="px-4 py-3">{fmtMs(row.duration_ms)}</td>
                    <td className="px-4 py-3">
                      {row.tokens_per_sec != null
                        ? `${row.tokens_per_sec} t/s`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sky-200/55">
                      {row.tokens_eval != null
                        ? `${row.tokens_prompt ?? "—"}→${row.tokens_eval}`
                        : `${row.prompt_chars}/${row.response_chars}c`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusTone(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sky-200/45"
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-400/10 px-4 py-3">
          <p className="text-xs text-sky-200/45">
            Page {Math.min(page, totalPages)} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
