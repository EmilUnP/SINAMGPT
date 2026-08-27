"use client";

import { Plus, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/components/LocaleProvider";
import { AdminPageHeader, AdminPanelCard } from "./AdminChrome";

type Provider = {
  id: string;
  kind: "ollama" | "vllm";
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
};

type Draft = { baseUrl: string; apiKey: string };

export const AdminProvidersPanel = () => {
  const t = useTranslations();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newKey, setNewKey] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyProviders = useCallback((rows: Provider[]) => {
    setProviders(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((provider) => [
          provider.id,
          { baseUrl: provider.baseUrl, apiKey: "" },
        ]),
      ),
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
  }, [applyProviders]);

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
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Network error");
        }
      });
    return () => controller.abort();
  }, [applyProviders]);

  const request = async (
    url: string,
    init: RequestInit,
  ): Promise<{ provider?: Provider; providers?: Provider[] }> => {
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
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Provider update failed");
      return data;
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdd = async () => {
    try {
      await request("/api/admin/providers", {
        method: "POST",
        body: JSON.stringify({
          id: newId,
          kind: "ollama",
          baseUrl: newUrl,
          enabled: true,
          ...(newKey.trim() ? { apiKey: newKey } : {}),
        }),
      });
      setNewId("");
      setNewUrl("");
      setNewKey("");
      await load();
      setNotice(t("admin.providers.added"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network error");
    }
  };

  const handleSave = async (provider: Provider, clearKey = false) => {
    const draft = drafts[provider.id];
    if (!draft) return;
    try {
      const data = await request(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          baseUrl: draft.baseUrl,
          ...(clearKey
            ? { apiKey: null }
            : draft.apiKey.trim()
              ? { apiKey: draft.apiKey }
              : {}),
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
        <div className="grid gap-3 p-4 md:grid-cols-[1fr_2fr_1.5fr_auto]">
          <input
            value={newId}
            onChange={(event) => setNewId(event.target.value)}
            placeholder={t("admin.providers.id")}
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
          />
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
            disabled={isBusy || !newId.trim() || !newUrl.trim()}
            onClick={() => void handleAdd()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Plus size={15} />
            {t("admin.providers.add")}
          </button>
        </div>
      </AdminPanelCard>

      <div className="space-y-3">
        {providers.map((provider) => {
          const draft = drafts[provider.id] ?? {
            baseUrl: provider.baseUrl,
            apiKey: "",
          };
          return (
            <AdminPanelCard key={provider.id}>
              <div className="grid gap-3 p-4 lg:grid-cols-[160px_1fr_180px_auto] lg:items-center">
                <div>
                  <p className="font-mono text-sm font-semibold">{provider.id}</p>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {provider.kind}
                    {provider.id === "ollama"
                      ? ` · ${t("admin.providers.default")}`
                      : ""}
                  </p>
                </div>
                <input
                  value={draft.baseUrl}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [provider.id]: { ...draft, baseUrl: event.target.value },
                    }))
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-3 py-2 text-sm"
                />
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
