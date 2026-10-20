"use client";

import { Activity, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslations } from "@/components/LocaleProvider";
import {
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPanelCard,
  AdminSection,
  adminBtnGhost,
  adminBtnPrimary,
  adminBtnRow,
  adminBtnRowDanger,
  adminFieldClass,
} from "./AdminChrome";
import { providerUrlIsRemote } from "@/lib/provider-url";
import type { ProviderKind } from "@/lib/llm/types";

type Provider = {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  fallbackId: string | null;
  maxConcurrent: number;
  toolsEnabled: boolean;
};

type Draft = {
  baseUrl: string;
  apiKey: string;
  kind: ProviderKind;
  fallbackId: string;
  maxConcurrent: string;
  toolsEnabled: boolean;
  acknowledgeRemote: boolean;
};

type Health = {
  backend: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};

type BusyAction = "test" | "sync" | "save" | "toggle" | "clearKey" | "delete";

type Props = {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const KINDS: ProviderKind[] = ["vllm", "openai"];

const kindLabelKey = (kind: ProviderKind) =>
  kind === "vllm"
    ? "admin.providers.kindVllm"
    : "admin.providers.kindOpenai";

const checkboxClass =
  "mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]";

export const AdminProvidersPanel = ({ onNotice, onError }: Props) => {
  const t = useTranslations();
  const confirm = useConfirm();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newKind, setNewKind] = useState<ProviderKind>("vllm");
  const [newFallback, setNewFallback] = useState("");
  const [newMaxConcurrent, setNewMaxConcurrent] = useState("32");
  const [newToolsEnabled, setNewToolsEnabled] = useState(false);
  const [newAck, setNewAck] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(
    null,
  );

  const applyProviders = useCallback((rows: Provider[]) => {
    setProviders(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((provider) => [
          provider.id,
          {
            baseUrl: provider.baseUrl,
            apiKey: "",
            kind: provider.kind,
            fallbackId: provider.fallbackId ?? "",
            maxConcurrent: String(provider.maxConcurrent ?? 0),
            toolsEnabled: provider.toolsEnabled,
            acknowledgeRemote: false,
          },
        ]),
      ),
    );
  }, []);

  const loadHealth = useCallback(async () => {
    const response = await fetch("/api/admin/providers/health", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      health?: Health[];
      error?: string;
    };
    if (!response.ok) return;
    setHealth(
      Object.fromEntries((data.health ?? []).map((row) => [row.backend, row])),
    );
  }, []);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/providers", { cache: "no-store" });
    const data = (await response.json()) as {
      providers?: Provider[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || t("admin.providers.failedLoad"));
    }
    applyProviders(data.providers ?? []);
    void loadHealth();
  }, [applyProviders, loadHealth, t]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/providers", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          providers?: Provider[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || t("admin.providers.failedLoad"));
        }
        applyProviders(data.providers ?? []);
        void loadHealth();
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          onError(
            loadError instanceof Error
              ? loadError.message
              : t("admin.chrome.networkError"),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [applyProviders, loadHealth, onError, t]);

  const request = async (
    url: string,
    init: RequestInit,
  ): Promise<{
    provider?: Provider;
    providers?: Provider[];
    health?: Health;
  }> => {
    setIsBusy(true);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      const data = (await response.json()) as {
        provider?: Provider;
        providers?: Provider[];
        health?: Health;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("admin.providers.updateFailed"));
      }
      return data;
    } finally {
      setIsBusy(false);
      setBusy(null);
    }
  };

  const fail = (requestError: unknown) =>
    onError(
      requestError instanceof Error
        ? requestError.message
        : t("admin.chrome.networkError"),
    );

  const newUrlIsRemote = useMemo(
    () => (newUrl.trim() ? providerUrlIsRemote(newUrl) : false),
    [newUrl],
  );

  const handleAdd = async () => {
    try {
      await request("/api/admin/providers", {
        method: "POST",
        body: JSON.stringify({
          id: newId,
          kind: newKind,
          baseUrl: newUrl,
          enabled: true,
          ...(newKey.trim() ? { apiKey: newKey } : {}),
          ...(newFallback ? { fallbackId: newFallback } : {}),
          maxConcurrent: Number(newMaxConcurrent) || 0,
          toolsEnabled: newToolsEnabled,
          ...(newUrlIsRemote ? { acknowledgeRemote: newAck } : {}),
        }),
      });
      setNewId("");
      setNewUrl("");
      setNewKey("");
      setNewKind("vllm");
      setNewFallback("");
      setNewMaxConcurrent("32");
      setNewAck(false);
      setNewToolsEnabled(false);
      await load();
      onNotice(t("admin.providers.added"));
    } catch (requestError) {
      fail(requestError);
    }
  };

  const handleSave = async (provider: Provider, clearKey = false) => {
    const draft = drafts[provider.id];
    if (!draft) return;
    const urlIsRemote = providerUrlIsRemote(draft.baseUrl);
    setBusy({ id: provider.id, action: clearKey ? "clearKey" : "save" });
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kind: draft.kind,
          baseUrl: draft.baseUrl,
          fallbackId: draft.fallbackId || null,
          maxConcurrent: Number(draft.maxConcurrent) || 0,
          toolsEnabled: draft.toolsEnabled,
          ...(clearKey
            ? { apiKey: null }
            : draft.apiKey.trim()
              ? { apiKey: draft.apiKey }
              : {}),
          ...(urlIsRemote ? { acknowledgeRemote: draft.acknowledgeRemote } : {}),
        }),
      });
      if (data.provider) {
        applyProviders(
          providers.map((row) =>
            row.id === data.provider?.id ? data.provider : row,
          ),
        );
      }
      onNotice(t("admin.providers.saved"));
    } catch (requestError) {
      fail(requestError);
    }
  };

  const handleToggle = async (provider: Provider) => {
    setBusy({ id: provider.id, action: "toggle" });
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (data.provider) {
        applyProviders(
          providers.map((row) =>
            row.id === data.provider?.id ? data.provider : row,
          ),
        );
      }
      onNotice(t("admin.providers.saved"));
    } catch (requestError) {
      fail(requestError);
    }
  };

  const handleDelete = async (provider: Provider) => {
    const ok = await confirm({
      title: t("admin.providers.delete"),
      description: t("admin.providers.confirmDelete", { name: provider.id }),
      confirmLabel: t("admin.providers.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy({ id: provider.id, action: "delete" });
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "DELETE",
      });
      applyProviders(data.providers ?? []);
      onNotice(t("admin.providers.deleted"));
    } catch (requestError) {
      fail(requestError);
    }
  };

  const handleTest = async (provider: Provider) => {
    setBusy({ id: provider.id, action: "test" });
    try {
      const data = await request(`/api/admin/providers/${provider.id}/test`, {
        method: "POST",
      });
      if (data.health) {
        setHealth((current) => ({ ...current, [provider.id]: data.health! }));
        if (data.health.ok) {
          onNotice(
            t("admin.providers.testOk", { ms: String(data.health.latencyMs) }),
          );
        } else {
          onError(
            t("admin.providers.testFail", {
              error: data.health.error || t("admin.providers.healthDown"),
            }),
          );
        }
      }
    } catch (requestError) {
      fail(requestError);
    }
  };

  const handleSync = async (provider: Provider) => {
    setBusy({ id: provider.id, action: "sync" });
    try {
      await request(`/api/admin/providers/${provider.id}/sync`, {
        method: "POST",
      });
      onNotice(t("admin.providers.synced"));
    } catch (requestError) {
      fail(requestError);
    }
  };

  const otherIds = (except: string) =>
    providers.filter((row) => row.id !== except).map((row) => row.id);

  const healthLabel = (provider: Provider) => {
    const row = health[provider.id];
    if (!row) return t("admin.providers.healthUnknown");
    if (row.ok) return t("admin.providers.healthOk", { ms: String(row.latencyMs) });
    return t("admin.providers.healthDown");
  };

  const isRunning = (id: string, action: BusyAction) =>
    busy?.id === id && busy.action === action;

  const updateDraft = (id: string, draft: Draft, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...draft, ...patch } }));

  return (
    <div className="space-y-4">
      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={Server}
            title={t("admin.providers.title")}
            description={t("admin.providers.description")}
          />

          <AdminSection title={t("admin.providers.add")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminField label={t("admin.providers.id")}>
                <input
                  value={newId}
                  onChange={(event) => setNewId(event.target.value)}
                  placeholder="gpu-2"
                  autoComplete="off"
                  className={adminFieldClass}
                />
              </AdminField>
              <AdminField label={t("admin.providers.kind")}>
                <select
                  value={newKind}
                  onChange={(event) =>
                    setNewKind(event.target.value as ProviderKind)
                  }
                  className={adminFieldClass}
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(kindLabelKey(kind))}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label={t("admin.providers.url")}>
                <input
                  value={newUrl}
                  onChange={(event) => setNewUrl(event.target.value)}
                  placeholder="http://10.0.0.22:8000"
                  inputMode="url"
                  autoComplete="off"
                  className={adminFieldClass}
                />
              </AdminField>
              <AdminField label={t("admin.providers.key")}>
                <input
                  type="password"
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  autoComplete="new-password"
                  className={adminFieldClass}
                />
              </AdminField>
              <AdminField label={t("admin.providers.fallback")}>
                <select
                  value={newFallback}
                  onChange={(event) => setNewFallback(event.target.value)}
                  className={adminFieldClass}
                >
                  <option value="">{t("admin.providers.fallbackNone")}</option>
                  {providers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.id}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label={t("admin.providers.maxConcurrent")}>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={newMaxConcurrent}
                  onChange={(event) => setNewMaxConcurrent(event.target.value)}
                  className={adminFieldClass}
                />
              </AdminField>
            </div>
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--admin-muted)]">
              <input
                type="checkbox"
                checked={newToolsEnabled}
                onChange={(event) => setNewToolsEnabled(event.target.checked)}
                className={checkboxClass}
              />
              {t("admin.providers.toolsEnabled")}
            </label>
            {newUrlIsRemote ? (
              <label className="flex items-start gap-2 rounded-lg border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={newAck}
                  onChange={(event) => setNewAck(event.target.checked)}
                  className={checkboxClass}
                />
                <span>
                  <span className="block font-medium text-[var(--status-warn-fg)]">
                    {t("admin.providers.remoteWarning")}
                  </span>
                  <span className="text-[var(--admin-fg)]">
                    {t("admin.providers.acknowledgeRemote")}
                  </span>
                </span>
              </label>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={
                  isBusy ||
                  !newId.trim() ||
                  !newUrl.trim() ||
                  (newUrlIsRemote && !newAck)
                }
                onClick={() => void handleAdd()}
                className={`${adminBtnPrimary} w-full sm:w-auto`}
              >
                <Plus size={15} />
                {t("admin.providers.add")}
              </button>
            </div>
          </AdminSection>
        </div>
      </AdminPanelCard>

      {isLoading ? (
        <AdminPanelCard>
          <AdminEmptyState>{t("admin.chrome.loading")}</AdminEmptyState>
        </AdminPanelCard>
      ) : providers.length === 0 ? (
        <AdminPanelCard>
          <AdminEmptyState>{t("admin.providers.empty")}</AdminEmptyState>
        </AdminPanelCard>
      ) : null}

      {providers.map((provider) => {
        const draft = drafts[provider.id] ?? {
          baseUrl: provider.baseUrl,
          apiKey: "",
          kind: provider.kind,
          fallbackId: provider.fallbackId ?? "",
          maxConcurrent: String(provider.maxConcurrent ?? 0),
          toolsEnabled: provider.toolsEnabled,
          acknowledgeRemote: false,
        };
        const urlIsRemote = providerUrlIsRemote(draft.baseUrl);
        const rowHealth = health[provider.id];
        return (
          <AdminPanelCard key={provider.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-[var(--admin-fg)] [overflow-wrap:anywhere]">
                  {provider.id}
                </p>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  {t(kindLabelKey(provider.kind))}
                  {provider.id === "vllm"
                    ? ` · ${t("admin.providers.default")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`status-pill ${
                    provider.enabled ? "status-ok" : "status-neutral"
                  }`}
                >
                  {provider.enabled
                    ? t("admin.providers.enabled")
                    : t("admin.providers.disabled")}
                </span>
                <span
                  title={rowHealth?.error}
                  className={`status-pill ${
                    rowHealth?.ok
                      ? "status-ok"
                      : rowHealth
                        ? "status-bad"
                        : "status-neutral"
                  }`}
                >
                  <Activity size={12} />
                  {healthLabel(provider)}
                </span>
              </div>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {provider.id !== "vllm" ? (
                  <AdminField label={t("admin.providers.kind")}>
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        updateDraft(provider.id, draft, {
                          kind: event.target.value as ProviderKind,
                        })
                      }
                      className={adminFieldClass}
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(kindLabelKey(kind))}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                ) : null}
                <AdminField
                  label={t("admin.providers.url")}
                  className={provider.id !== "vllm" ? "" : "sm:col-span-2"}
                >
                  <input
                    value={draft.baseUrl}
                    onChange={(event) =>
                      updateDraft(provider.id, draft, {
                        baseUrl: event.target.value,
                      })
                    }
                    inputMode="url"
                    autoComplete="off"
                    className={adminFieldClass}
                  />
                </AdminField>
                <AdminField label={t("admin.providers.fallback")}>
                  <select
                    value={draft.fallbackId}
                    onChange={(event) =>
                      updateDraft(provider.id, draft, {
                        fallbackId: event.target.value,
                      })
                    }
                    className={adminFieldClass}
                  >
                    <option value="">{t("admin.providers.fallbackNone")}</option>
                    {otherIds(provider.id).map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label={t("admin.providers.maxConcurrent")}>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={draft.maxConcurrent}
                    onChange={(event) =>
                      updateDraft(provider.id, draft, {
                        maxConcurrent: event.target.value,
                      })
                    }
                    className={adminFieldClass}
                  />
                </AdminField>
                <AdminField
                  label={t("admin.providers.key")}
                  className="sm:col-span-2 lg:col-span-1"
                >
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={(event) =>
                      updateDraft(provider.id, draft, {
                        apiKey: event.target.value,
                      })
                    }
                    placeholder={
                      provider.hasApiKey
                        ? t("admin.providers.keySet")
                        : t("admin.providers.noKey")
                    }
                    autoComplete="new-password"
                    className={adminFieldClass}
                  />
                </AdminField>
              </div>
              <label className="flex items-start gap-2 text-xs leading-relaxed text-[var(--admin-muted)]">
                <input
                  type="checkbox"
                  checked={draft.toolsEnabled}
                  onChange={(event) =>
                    updateDraft(provider.id, draft, {
                      toolsEnabled: event.target.checked,
                    })
                  }
                  className={checkboxClass}
                />
                {t("admin.providers.toolsEnabled")}
              </label>
              {urlIsRemote ? (
                <label className="flex items-start gap-2 rounded-lg border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-3 py-2.5 text-xs text-[var(--status-warn-fg)]">
                  <input
                    type="checkbox"
                    checked={draft.acknowledgeRemote}
                    onChange={(event) =>
                      updateDraft(provider.id, draft, {
                        acknowledgeRemote: event.target.checked,
                      })
                    }
                    className={checkboxClass}
                  />
                  <span>
                    {t("admin.providers.remoteWarning")}{" "}
                    {t("admin.providers.acknowledgeRemote")}
                  </span>
                </label>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--admin-border)] px-4 py-3">
              <button
                type="button"
                disabled={
                  isBusy ||
                  (urlIsRemote &&
                    !draft.acknowledgeRemote &&
                    draft.baseUrl !== provider.baseUrl)
                }
                onClick={() => void handleSave(provider)}
                className={adminBtnPrimary}
              >
                {isRunning(provider.id, "save")
                  ? t("admin.chrome.saving")
                  : t("admin.providers.save")}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleTest(provider)}
                className={adminBtnGhost}
              >
                <Activity size={14} />
                {isRunning(provider.id, "test")
                  ? t("admin.providers.testing")
                  : t("admin.providers.test")}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleSync(provider)}
                className={adminBtnGhost}
              >
                <RefreshCw
                  size={14}
                  className={isRunning(provider.id, "sync") ? "animate-spin" : ""}
                />
                {isRunning(provider.id, "sync")
                  ? t("admin.providers.syncing")
                  : t("admin.providers.sync")}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handleToggle(provider)}
                className={adminBtnGhost}
              >
                {provider.enabled
                  ? t("admin.chrome.disable")
                  : t("admin.chrome.enable")}
              </button>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {provider.hasApiKey ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSave(provider, true)}
                    className={adminBtnRow}
                  >
                    {t("admin.providers.clearKey")}
                  </button>
                ) : null}
                {provider.id !== "vllm" ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDelete(provider)}
                    className={adminBtnRowDanger}
                  >
                    <Trash2 size={13} />
                    {t("admin.providers.delete")}
                  </button>
                ) : null}
              </div>
            </div>
          </AdminPanelCard>
        );
      })}
    </div>
  );
};
