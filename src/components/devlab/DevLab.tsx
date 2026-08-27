"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  FlaskConical,
  KeyRound,
  RefreshCw,
  Settings,
  Shield,
} from "lucide-react";
import {
  AdminHint,
  AdminPageHeader,
  AdminPanelCard,
  AdminStatCard,
  AdminStatGrid,
  AdminSubtabs,
  AdminToggleCard,
  adminBtnGhost,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/admin/AdminChrome";
import { PageHeader } from "@/components/PageHeader";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLocale } from "@/components/LocaleProvider";
import { formatDateTime, usageStatusLabel } from "@/lib/ui";
import type { ApiGatewaySettings, ApiKeyPublic } from "@/lib/api-keys";
import type { ApiUsageEvent, ApiUsageStatus } from "@/lib/usage/api";
import type { User } from "@/lib/types";

type Props = { admin: User; developerApiEnabled?: boolean };

type Tab = "overview" | "keys" | "requests" | "settings";

type Analytics = {
  summary: Record<string, number | null>;
  byModel: Array<{
    model: string;
    requests: number;
    avg_duration_ms: number | null;
  }>;
  activeKeys: number;
  totalKeys: number;
};

type LiveRow = {
  id: string;
  username: string;
  model: string;
  elapsedMs: number;
};

const num = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? "—" : String(value);

export const DevLab = ({ admin, developerApiEnabled = false }: Props) => {
  const { locale, t } = useLocale();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("overview");
  const [, setSettings] = useState<ApiGatewaySettings | null>(null);
  const [draft, setDraft] = useState<ApiGatewaySettings | null>(null);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [requests, setRequests] = useState<ApiUsageEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<ApiUsageStatus | "">("");
  const [username, setUsername] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    if (status) params.set("status", status);
    if (username.trim()) params.set("username", username.trim());
    if (model.trim()) params.set("model", model.trim());

    try {
      const res = await fetch(`/api/admin/devlab?${params.toString()}`);
      const data = (await res.json()) as {
        settings?: ApiGatewaySettings;
        keys?: ApiKeyPublic[];
        live?: LiveRow[];
        analytics?: Analytics;
        requests?: {
          rows: ApiUsageEvent[];
          page: number;
          totalPages: number;
        };
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("devlab.loadFailed"));
        return;
      }
      if (data.settings) {
        setSettings(data.settings);
        setDraft((prev) => prev ?? data.settings!);
      }
      setKeys(data.keys ?? []);
      setLive(data.live ?? []);
      setAnalytics(data.analytics ?? null);
      setRequests(data.requests?.rows ?? []);
      setTotalPages(data.requests?.totalPages ?? 1);
    } catch {
      setError(t("devlab.loadFailed"));
    }
  }, [model, page, status, t, username]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const handleKeyPatch = async (
    id: string,
    body: { enabled?: boolean; revoke?: boolean },
  ) => {
    if (body.revoke) {
      const ok = await confirm({
        title: t("devlab.revoke"),
        description: t("devlab.revokeConfirm"),
        confirmLabel: t("devlab.revoke"),
        tone: "danger",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/admin/devlab/keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || t("devlab.loadFailed"));
      return;
    }
    await load();
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/devlab", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          corsOrigins: draft.corsOrigins,
        }),
      });
      const data = (await res.json()) as {
        settings?: ApiGatewaySettings;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        setError(data.error || t("devlab.saveFailed"));
        return;
      }
      setSettings(data.settings);
      setDraft(data.settings);
      setNotice(t("devlab.saved"));
    } catch {
      setError(t("devlab.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const summary = analytics?.summary ?? {};
  const keyStatus = (key: ApiKeyPublic) => {
    if (key.revokedAt) return t("devlab.revoked");
    if (!key.isEnabled) return t("devlab.disabled");
    return t("devlab.active");
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--admin-fg)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(37,99,235,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 10%, rgba(14,165,233,0.1), transparent 50%)",
        }}
      />
      <PageHeader
        maxWidthClass="max-w-7xl"
        backLabel={t("devlab.backToChat")}
        icon={KeyRound}
        title={t("devlab.title")}
        badge={t("devlab.badge")}
        subtitle={`${admin.username} · ${t("common.brand")}`}
        links={[
          ...(developerApiEnabled
            ? [{ href: "/developer", label: t("devlab.developer") }]
            : []),
          { href: "/lab", label: t("devlab.lab"), icon: FlaskConical },
          { href: "/admin", label: t("devlab.admin"), icon: Shield },
        ]}
      />

      <main className="relative z-10 mx-auto max-w-7xl space-y-5 px-4 py-6">
        <AdminPanelCard>
          <div className="space-y-4 px-4 py-4">
            <AdminPageHeader
              icon={BarChart3}
              title={t("devlab.title")}
              description={t("devlab.description")}
              actions={
                <button
                  type="button"
                  className={adminBtnGhost}
                  onClick={() => void load()}
                >
                  <RefreshCw size={14} />
                  {t("devlab.refresh")}
                </button>
              }
            />
            {error ? (
              <p className="text-sm text-[var(--status-bad-fg)]">{error}</p>
            ) : null}
            {notice ? (
              <p className="text-sm text-[var(--status-ok-fg)]">{notice}</p>
            ) : null}

            <AdminSubtabs
              tabs={[
                { id: "overview", label: t("devlab.tabOverview") },
                {
                  id: "keys",
                  label: t("devlab.tabKeys"),
                  count: keys.length,
                },
                { id: "requests", label: t("devlab.tabRequests") },
                {
                  id: "settings",
                  label: t("devlab.tabSettings"),
                  icon: Settings,
                },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === "overview" ? (
              <div className="space-y-4">
                <AdminStatGrid>
                  <AdminStatCard
                    label={t("devlab.requestsToday")}
                    value={num(summary.requests_today)}
                    hint={`${num(summary.ok_today)} ok`}
                  />
                  <AdminStatCard
                    label={t("devlab.errorRate")}
                    value={num(summary.fail_today)}
                    tone={(summary.fail_today ?? 0) > 0 ? "warn" : "ok"}
                  />
                  <AdminStatCard
                    label={t("devlab.activeKeys")}
                    value={analytics?.activeKeys ?? 0}
                    hint={`${analytics?.totalKeys ?? 0} ${t("devlab.totalKeys").toLowerCase()}`}
                  />
                  <AdminStatCard
                    label={t("devlab.liveNow")}
                    value={live.length}
                    tone="info"
                  />
                  <AdminStatCard
                    label={t("devlab.avgLatency")}
                    value={
                      summary.avg_duration_ms != null
                        ? `${summary.avg_duration_ms} ms`
                        : "—"
                    }
                  />
                  <AdminStatCard
                    label={t("devlab.avgTtft")}
                    value={
                      summary.avg_ttft_ms != null
                        ? `${summary.avg_ttft_ms} ms`
                        : "—"
                    }
                  />
                </AdminStatGrid>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                    {t("devlab.topModels")}
                  </p>
                  {analytics?.byModel.length ? (
                    <ul className="space-y-1 text-sm">
                      {analytics.byModel.map((row) => (
                        <li
                          key={row.model}
                          className="flex justify-between rounded-lg border border-[var(--admin-border)] px-3 py-2"
                        >
                          <span>{row.model}</span>
                          <span className="tabular-nums text-[var(--admin-muted)]">
                            {row.requests}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--admin-muted)]">
                      {t("devlab.noModels")}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "keys" ? (
              keys.length === 0 ? (
                <p className="text-sm text-[var(--admin-muted)]">
                  {t("devlab.noKeys")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                      <tr>
                        <th className="pb-2 pr-3">{t("devlab.colUser")}</th>
                        <th className="pb-2 pr-3">{t("devlab.colName")}</th>
                        <th className="pb-2 pr-3">{t("devlab.colKey")}</th>
                        <th className="pb-2 pr-3">{t("devlab.colStatus")}</th>
                        <th className="pb-2 pr-3">{t("devlab.colLastUsed")}</th>
                        <th className="pb-2">{t("devlab.colActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => (
                        <tr
                          key={key.id}
                          className="border-t border-[var(--admin-border)]"
                        >
                          <td className="py-2.5 pr-3">{key.username}</td>
                          <td className="py-2.5 pr-3">{key.name}</td>
                          <td className="py-2.5 pr-3 font-mono text-xs">
                            {key.keyPrefix}…
                          </td>
                          <td className="py-2.5 pr-3 text-xs">
                            {keyStatus(key)}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-[var(--admin-muted)]">
                            {key.lastUsedAt
                              ? formatDateTime(key.lastUsedAt, locale)
                              : t("devlab.never")}
                          </td>
                          <td className="py-2.5">
                            {!key.revokedAt ? (
                              <span className="inline-flex gap-2">
                                <button
                                  type="button"
                                  className="text-xs text-[var(--accent)]"
                                  onClick={() =>
                                    void handleKeyPatch(key.id, {
                                      enabled: !key.isEnabled,
                                    })
                                  }
                                >
                                  {key.isEnabled
                                    ? t("devlab.disable")
                                    : t("devlab.enable")}
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-[var(--status-bad-fg)]"
                                  onClick={() =>
                                    void handleKeyPatch(key.id, {
                                      revoke: true,
                                    })
                                  }
                                >
                                  {t("devlab.revoke")}
                                </button>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {tab === "requests" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={username}
                    onChange={(e) => {
                      setPage(1);
                      setUsername(e.target.value);
                    }}
                    placeholder={t("devlab.filterUser")}
                    className={`${adminFieldClass} mt-0 max-w-[12rem]`}
                  />
                  <input
                    value={model}
                    onChange={(e) => {
                      setPage(1);
                      setModel(e.target.value);
                    }}
                    placeholder={t("devlab.filterModel")}
                    className={`${adminFieldClass} mt-0 max-w-[10rem]`}
                  />
                  <select
                    value={status}
                    onChange={(e) => {
                      setPage(1);
                      setStatus(e.target.value as ApiUsageStatus | "");
                    }}
                    className={`${adminFieldClass} mt-0 max-w-[10rem]`}
                  >
                    <option value="">{t("devlab.all")}</option>
                    <option value="ok">{t("common.statusOk")}</option>
                    <option value="error">{t("common.statusError")}</option>
                    <option value="rejected">{t("common.statusRejected")}</option>
                    <option value="aborted">{t("common.statusAborted")}</option>
                  </select>
                </div>
                {requests.length === 0 ? (
                  <p className="text-sm text-[var(--admin-muted)]">
                    {t("devlab.noRequests")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                        <tr>
                          <th className="pb-2 pr-3">{t("devlab.colTime")}</th>
                          <th className="pb-2 pr-3">{t("devlab.colUser")}</th>
                          <th className="pb-2 pr-3">{t("devlab.colKey")}</th>
                          <th className="pb-2 pr-3">{t("devlab.colModel")}</th>
                          <th className="pb-2 pr-3">{t("devlab.colStatus")}</th>
                          <th className="pb-2 pr-3">{t("devlab.colLatency")}</th>
                          <th className="pb-2">{t("devlab.colError")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((row) => (
                          <tr
                            key={row.id}
                            className="border-t border-[var(--admin-border)]"
                          >
                            <td className="py-2 pr-3 text-xs text-[var(--admin-muted)]">
                              {formatDateTime(row.created_at, locale)}
                            </td>
                            <td className="py-2 pr-3">{row.username}</td>
                            <td className="py-2 pr-3 font-mono text-xs">
                              {row.key_prefix ? `${row.key_prefix}…` : "—"}
                            </td>
                            <td className="py-2 pr-3">{row.model || "—"}</td>
                            <td className="py-2 pr-3 text-xs">
                              {usageStatusLabel(row.status, locale)}
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-xs">
                              {t("common.ms", { n: row.duration_ms })}
                            </td>
                            <td className="py-2 text-xs text-[var(--status-bad-fg)]">
                              {row.error_message || ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-[var(--admin-muted)]">
                  <span>
                    {t("devlab.pageOf", { page, total: totalPages })}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={adminBtnGhost}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("devlab.prev")}
                    </button>
                    <button
                      type="button"
                      className={adminBtnGhost}
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("devlab.next")}
                    </button>
                  </span>
                </div>
              </div>
            ) : null}

            {tab === "settings" && draft ? (
              <div className="max-w-xl space-y-4">
                <AdminToggleCard
                  checked={draft.enabled}
                  onChange={(enabled) => setDraft({ ...draft, enabled })}
                  label={t("devlab.gatewayOn")}
                  hint={t("devlab.gatewayOnHint")}
                  emphasize
                />
                <label className="block text-xs font-medium text-[var(--admin-muted)]">
                  {t("devlab.maxKeys")}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={draft.maxKeysPerUser}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        maxKeysPerUser: Number(e.target.value),
                      })
                    }
                    className={adminFieldClass}
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--admin-muted)]">
                  {t("devlab.rpm")}
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={draft.maxRequestsPerMinute}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        maxRequestsPerMinute: Number(e.target.value),
                      })
                    }
                    className={adminFieldClass}
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--admin-muted)]">
                  {t("devlab.maxChars")}
                  <input
                    type="number"
                    min={500}
                    max={32000}
                    value={draft.maxChars}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        maxChars: Number(e.target.value),
                      })
                    }
                    className={adminFieldClass}
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--admin-muted)]">
                  {t("devlab.cors")}
                  <textarea
                    rows={4}
                    value={draft.corsOrigins.join("\n")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        corsOrigins: e.target.value
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean),
                      })
                    }
                    className={`${adminFieldClass} resize-y`}
                  />
                </label>
                <AdminHint>{t("devlab.corsHint")}</AdminHint>
                <button
                  type="button"
                  className={adminBtnPrimary}
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? t("devlab.saving") : t("devlab.save")}
                </button>
              </div>
            ) : null}
          </div>
        </AdminPanelCard>
      </main>
    </div>
  );
};
