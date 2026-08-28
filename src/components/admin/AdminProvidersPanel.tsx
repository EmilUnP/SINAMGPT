"use client";

import { Activity, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/components/LocaleProvider";
import { AdminPageHeader, AdminPanelCard } from "./AdminChrome";
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
};

type Draft = {
  baseUrl: string;
  apiKey: string;
  kind: ProviderKind;
  fallbackId: string;
  maxConcurrent: string;
  acknowledgeRemote: boolean;
};

type Health = {
  backend: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl: string;
};

const KINDS: ProviderKind[] = ["ollama", "vllm", "openai"];

const kindLabelKey = (kind: ProviderKind) =>
  kind === "ollama"
    ? "admin.providers.kindOllama"
    : kind === "vllm"
      ? "admin.providers.kindVllm"
      : "admin.providers.kindOpenai";

export const AdminProvidersPanel = () => {
  const t = useTranslations();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newKind, setNewKind] = useState<ProviderKind>("ollama");
  const [newFallback, setNewFallback] = useState("");
  const [newMaxConcurrent, setNewMaxConcurrent] = useState("0");
  const [newAck, setNewAck] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    if (!response.ok) throw new Error(data.error || "Could not load providers");
    applyProviders(data.providers ?? []);
    void loadHealth();
  }, [applyProviders, loadHealth]);

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
        if (!response.ok) throw new Error(data.error || "Could not load providers");
        applyProviders(data.providers ?? []);
        void loadHealth();
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Network error");
        }
      });
    return () => controller.abort();
  }, [applyProviders, loadHealth]);

  const request = async (
    url: string,
    init: RequestInit,
  ): Promise<{
    provider?: Provider;
    providers?: Provider[];
    health?: Health;
  }> => {
    setIsBusy(true);
    setError("");
    setNotice("");
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
      if (!response.ok) throw new Error(data.error || "Provider update failed");
      return data;
    } finally {
      setIsBusy(false);
      setBusyId("");
    }
  };

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
          ...(newUrlIsRemote ? { acknowledgeRemote: newAck } : {}),
        }),
      });
      setNewId("");
      setNewUrl("");
      setNewKey("");
      setNewKind("ollama");
      setNewFallback("");
      setNewMaxConcurrent("0");
      setNewAck(false);
      await load();
      setNotice(t("admin.providers.added"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleSave = async (provider: Provider, clearKey = false) => {
    const draft = drafts[provider.id];
    if (!draft) return;
    const urlIsRemote = providerUrlIsRemote(draft.baseUrl);
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kind: draft.kind,
          baseUrl: draft.baseUrl,
          fallbackId: draft.fallbackId || null,
          maxConcurrent: Number(draft.maxConcurrent) || 0,
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
      setNotice(t("admin.providers.saved"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleToggle = async (provider: Provider) => {
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
      setNotice(t("admin.providers.saved"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleDelete = async (provider: Provider) => {
    if (!window.confirm(t("admin.providers.confirmDelete", { name: provider.id }))) {
      return;
    }
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "DELETE",
      });
      applyProviders(data.providers ?? []);
      setNotice(t("admin.providers.deleted"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleTest = async (provider: Provider) => {
    setBusyId(provider.id);
    try {
      const data = await request(`/api/admin/providers/${provider.id}/test`, {
        method: "POST",
      });
      if (data.health) {
        setHealth((current) => ({ ...current, [provider.id]: data.health! }));
        setNotice(
          data.health.ok
            ? t("admin.providers.testOk", { ms: String(data.health.latencyMs) })
            : t("admin.providers.testFail", {
                error: data.health.error || "Unreachable",
              }),
        );
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleSync = async (provider: Provider) => {
    setBusyId(provider.id);
    try {
      await request(`/api/admin/providers/${provider.id}/sync`, {
        method: "POST",
      });
      setNotice(t("admin.providers.synced"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
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

  return (
    <div className="space-y-4 animate-fade-up">
      <AdminPageHeader
        icon={Server}
        title={t("admin.providers.title")}
        description={t("admin.providers.description")}
      />
      {error ? (
        <p className="rounded-xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-3 py-2 text-sm text-[var(--status-bad-fg)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-3 py-2 text-sm text-[var(--status-ok-fg)]">
          {notice}
        </p>
      ) : null}

      <AdminPanelCard>
        <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-[140px_1fr_1fr_1fr_auto]">
          <input
            value={newId}
            onChange={(event) => setNewId(event.target.value)}
            placeholder={t("admin.providers.id")}
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
          />
          <select
            value={newKind}
            onChange={(event) => setNewKind(event.target.value as ProviderKind)}
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
            aria-label={t("admin.providers.kind")}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(kindLabelKey(kind))}
              </option>
            ))}
          </select>
          <input
            value={newUrl}
            onChange={(event) => setNewUrl(event.target.value)}
            placeholder="http://10.0.0.22:11434"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder={t("admin.providers.key")}
            autoComplete="new-password"
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={isBusy || !newId.trim() || !newUrl.trim() || (newUrlIsRemote && !newAck)}
            onClick={() => void handleAdd()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Plus size={15} />
            {t("admin.providers.add")}
          </button>
        </div>
        <div className="grid gap-3 border-t border-[var(--admin-border)] px-4 py-3 md:grid-cols-2">
          <label className="text-xs text-[var(--admin-muted)]">
            {t("admin.providers.fallback")}
            <select
              value={newFallback}
              onChange={(event) => setNewFallback(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm text-[var(--admin-fg)]"
            >
              <option value="">{t("admin.providers.fallbackNone")}</option>
              {providers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--admin-muted)]">
            {t("admin.providers.maxConcurrent")}
            <input
              type="number"
              min={0}
              max={10000}
              value={newMaxConcurrent}
              onChange={(event) => setNewMaxConcurrent(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm text-[var(--admin-fg)]"
            />
          </label>
        </div>
        {newUrlIsRemote ? (
          <label className="flex items-start gap-2 border-t border-[var(--status-warn-border,var(--admin-border))] bg-[var(--status-warn-bg,transparent)] px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={newAck}
              onChange={(event) => setNewAck(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-[var(--status-warn-fg,var(--admin-fg))]">
                {t("admin.providers.remoteWarning")}
              </span>
              {t("admin.providers.acknowledgeRemote")}
            </span>
          </label>
        ) : null}
      </AdminPanelCard>

      <div className="space-y-3">
        {providers.map((provider) => {
          const draft = drafts[provider.id] ?? {
            baseUrl: provider.baseUrl,
            apiKey: "",
            kind: provider.kind,
            fallbackId: provider.fallbackId ?? "",
            maxConcurrent: String(provider.maxConcurrent ?? 0),
            acknowledgeRemote: false,
          };
          const urlIsRemote = providerUrlIsRemote(draft.baseUrl);
          const rowHealth = health[provider.id];
          return (
            <AdminPanelCard key={provider.id}>
              <div className="grid gap-3 p-4 lg:grid-cols-[160px_1fr_180px_auto] lg:items-start">
                <div>
                  <p className="font-mono text-sm font-semibold">{provider.id}</p>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {t(kindLabelKey(provider.kind))}
                    {provider.id === "ollama"
                      ? ` · ${t("admin.providers.default")}`
                      : ""}
                  </p>
                  <p
                    className={`mt-1 inline-flex items-center gap-1 text-xs ${
                      rowHealth?.ok
                        ? "text-[var(--status-ok-fg)]"
                        : rowHealth
                          ? "text-[var(--status-bad-fg)]"
                          : "text-[var(--admin-muted)]"
                    }`}
                  >
                    <Activity size={12} />
                    {healthLabel(provider)}
                  </p>
                </div>
                <div className="space-y-2">
                  {provider.id !== "ollama" ? (
                    <select
                      value={draft.kind}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider.id]: {
                            ...draft,
                            kind: event.target.value as ProviderKind,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                      aria-label={t("admin.providers.kind")}
                    >
                      {KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(kindLabelKey(kind))}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    value={draft.baseUrl}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [provider.id]: { ...draft, baseUrl: event.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={draft.fallbackId}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider.id]: {
                            ...draft,
                            fallbackId: event.target.value,
                          },
                        }))
                      }
                      className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                      aria-label={t("admin.providers.fallback")}
                    >
                      <option value="">{t("admin.providers.fallbackNone")}</option>
                      {otherIds(provider.id).map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={draft.maxConcurrent}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [provider.id]: {
                            ...draft,
                            maxConcurrent: event.target.value,
                          },
                        }))
                      }
                      aria-label={t("admin.providers.maxConcurrent")}
                      className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                    />
                  </div>
                  {urlIsRemote ? (
                    <label className="flex items-start gap-2 text-xs text-[var(--status-warn-fg,var(--admin-fg))]">
                      <input
                        type="checkbox"
                        checked={draft.acknowledgeRemote}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [provider.id]: {
                              ...draft,
                              acknowledgeRemote: event.target.checked,
                            },
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        {t("admin.providers.remoteWarning")}{" "}
                        {t("admin.providers.acknowledgeRemote")}
                      </span>
                    </label>
                  ) : null}
                </div>
                <input
                  type="password"
                  value={draft.apiKey}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [provider.id]: { ...draft, apiKey: event.target.value },
                    }))
                  }
                  placeholder={
                    provider.hasApiKey
                      ? t("admin.providers.keySet")
                      : t("admin.providers.noKey")
                  }
                  autoComplete="new-password"
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleTest(provider)}
                    className="rounded-lg border border-[var(--admin-border)] px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {busyId === provider.id && isBusy
                      ? t("admin.providers.testing")
                      : t("admin.providers.test")}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSync(provider)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-border)] px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <RefreshCw size={12} />
                    {busyId === provider.id && isBusy
                      ? t("admin.providers.syncing")
                      : t("admin.providers.sync")}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy || (urlIsRemote && !draft.acknowledgeRemote && draft.baseUrl !== provider.baseUrl)}
                    onClick={() => void handleSave(provider)}
                    className="rounded-lg border border-[var(--admin-border)] px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {t("admin.providers.save")}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggle(provider)}
                    className="rounded-lg border border-[var(--admin-border)] px-2.5 py-1.5 text-xs font-semibold"
                  >
                    {provider.enabled
                      ? t("admin.providers.disabled")
                      : t("admin.providers.enabled")}
                  </button>
                  {provider.hasApiKey ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleSave(provider, true)}
                      className="rounded-lg border border-[var(--admin-border)] px-2.5 py-1.5 text-xs"
                    >
                      {t("admin.providers.clearKey")}
                    </button>
                  ) : null}
                  {provider.id !== "ollama" ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDelete(provider)}
                      className="inline-flex items-center gap-1 rounded-lg text-xs text-[var(--status-bad-fg)]"
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
    </div>
  );
};
