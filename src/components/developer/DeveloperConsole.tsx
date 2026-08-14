"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Copy,
  FlaskConical,
  KeyRound,
  Shield,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import {
  AdminHint,
  AdminPanelCard,
  AdminSubtabs,
  adminBtnGhost,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/admin/AdminChrome";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { ApiKeyPublic } from "@/lib/api-keys";
import type { ApiUsageEvent } from "@/lib/api-usage";
import type { User } from "@/lib/types";

type Props = { user: User };

type Tab = "keys" | "requests" | "howto";

const formatWhen = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export const DeveloperConsole = ({ user }: Props) => {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("keys");
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [maxKeys, setMaxKeys] = useState(5);
  const [gatewayOn, setGatewayOn] = useState(true);
  const [rpm, setRpm] = useState(30);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<ApiUsageEvent[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [keysRes, usageRes] = await Promise.all([
        fetch("/api/developer/keys"),
        fetch("/api/developer/usage?limit=40"),
      ]);
      const keysData = (await keysRes.json()) as {
        keys?: ApiKeyPublic[];
        settings?: {
          enabled: boolean;
          maxKeysPerUser: number;
          maxRequestsPerMinute: number;
        };
        error?: string;
      };
      const usageData = (await usageRes.json()) as {
        rows?: ApiUsageEvent[];
      };
      if (!keysRes.ok) {
        setError(keysData.error || t("developer.loadFailed"));
        return;
      }
      setKeys(keysData.keys ?? []);
      if (keysData.settings) {
        setGatewayOn(keysData.settings.enabled);
        setMaxKeys(keysData.settings.maxKeysPerUser);
        setRpm(keysData.settings.maxRequestsPerMinute);
      }
      setRequests(usageData.rows ?? []);
    } catch {
      setError(t("developer.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = keys.filter((k) => !k.revokedAt).length;

  const curl = useMemo(() => {
    const sample = secret || "sinam_YOUR_KEY";
    return `curl -N http://localhost:3055/api/v1/generate \\
  -H "Authorization: Bearer ${sample}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gemma3:4b","stream":true,"messages":[{"role":"user","content":"Hello from another SINAM app"}]}'`;
  }, [secret]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = (await res.json()) as {
        key?: ApiKeyPublic;
        secret?: string;
        error?: string;
      };
      if (!res.ok || !data.key || !data.secret) {
        setError(data.error || t("developer.createFailed"));
        return;
      }
      setSecret(data.secret);
      setName("");
      setCopied(false);
      await load();
    } catch {
      setError(t("developer.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (id: string, body: { enabled?: boolean; revoke?: boolean }) => {
    if (body.revoke && !window.confirm(t("developer.revokeConfirm"))) return;
    setError(null);
    const res = await fetch(`/api/developer/keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || t("developer.updateFailed"));
      return;
    }
    if (body.revoke) setSecret(null);
    await load();
  };

  const copySecret = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  };

  const keyStatus = (key: ApiKeyPublic) => {
    if (key.revokedAt) return t("developer.revoked");
    if (!key.isEnabled) return t("developer.disabled");
    return t("developer.active");
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
      <header className="relative z-10 border-b border-[var(--admin-border)] bg-[var(--bg-elevated)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
            >
              <ArrowLeft size={16} />
              {t("developer.backToChat")}
            </Link>
            <div className="flex items-center gap-2.5">
              <Image
                src={sinamLogo}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
                style={{ width: "auto", height: "auto" }}
                priority
              />
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-[var(--accent)]" />
                  <h1 className="text-lg font-semibold tracking-tight">
                    {t("developer.title")}
                  </h1>
                  <span className="status-pill status-info">
                    {t("developer.badge")}
                  </span>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">
                  {user.username} · SINAMGPT
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle size="sm" />
            <ThemeToggle size="sm" />
            {user.role === "admin" ? (
              <>
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)]"
                >
                  <Shield size={14} />
                  {t("developer.admin")}
                </Link>
                <Link
                  href="/lab"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)]"
                >
                  <FlaskConical size={14} />
                  {t("developer.lab")}
                </Link>
                <Link
                  href="/devlab"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)]"
                >
                  {t("developer.devLab")}
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 py-6">
        <AdminPanelCard>
          <div className="space-y-4 px-4 py-4">
            <p className="text-sm leading-relaxed text-[var(--admin-muted)]">
              {t("developer.description")}
            </p>
            {!gatewayOn ? (
              <AdminHint>{t("developer.gatewayOff")}</AdminHint>
            ) : null}
            {error ? (
              <p className="text-sm text-[var(--status-bad-fg)]">{error}</p>
            ) : null}

            <AdminSubtabs
              tabs={[
                { id: "keys", label: t("developer.keys"), count: keys.length },
                {
                  id: "requests",
                  label: t("developer.requests"),
                  count: requests.length,
                },
                { id: "howto", label: t("developer.howTo") },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === "keys" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[12rem] flex-1 text-xs font-medium text-[var(--admin-muted)]">
                    {t("developer.create")}
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("developer.namePlaceholder")}
                      className={adminFieldClass}
                      disabled={!gatewayOn || busy}
                    />
                  </label>
                  <button
                    type="button"
                    className={adminBtnPrimary}
                    disabled={!gatewayOn || busy}
                    onClick={() => void handleCreate()}
                  >
                    {busy ? t("developer.creating") : t("developer.create")}
                  </button>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("developer.limitHint", { used: activeCount, max: maxKeys })}
                  {" · "}
                  {rpm}/min
                </p>

                {secret ? (
                  <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3.5 py-3">
                    <p className="text-xs font-medium text-[var(--admin-muted)]">
                      {t("developer.secretOnce")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="break-all rounded-lg bg-[var(--admin-surface)] px-2 py-1 text-xs">
                        {secret}
                      </code>
                      <button
                        type="button"
                        className={adminBtnGhost}
                        onClick={() => void copySecret()}
                      >
                        <Copy size={14} />
                        {copied ? t("developer.copied") : t("developer.copy")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {keys.length === 0 ? (
                  <p className="text-sm text-[var(--admin-muted)]">
                    {t("developer.noKeys")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                        <tr>
                          <th className="pb-2 pr-3">{t("developer.keys")}</th>
                          <th className="pb-2 pr-3">{t("developer.prefix")}</th>
                          <th className="pb-2 pr-3">{t("developer.status")}</th>
                          <th className="pb-2 pr-3">{t("developer.lastUsed")}</th>
                          <th className="pb-2">{t("developer.created")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((key) => (
                          <tr
                            key={key.id}
                            className="border-t border-[var(--admin-border)]"
                          >
                            <td className="py-2.5 pr-3 font-medium">{key.name}</td>
                            <td className="py-2.5 pr-3 font-mono text-xs">
                              {key.keyPrefix}…
                            </td>
                            <td className="py-2.5 pr-3">
                              <span className="text-xs">{keyStatus(key)}</span>
                              {!key.revokedAt ? (
                                <span className="ml-2 inline-flex gap-1">
                                  <button
                                    type="button"
                                    className="text-xs text-[var(--accent)]"
                                    onClick={() =>
                                      void handlePatch(key.id, {
                                        enabled: !key.isEnabled,
                                      })
                                    }
                                  >
                                    {key.isEnabled
                                      ? t("developer.disable")
                                      : t("developer.enable")}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs text-[var(--status-bad-fg)]"
                                    onClick={() =>
                                      void handlePatch(key.id, { revoke: true })
                                    }
                                  >
                                    {t("developer.revoke")}
                                  </button>
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-[var(--admin-muted)]">
                              {key.lastUsedAt
                                ? formatWhen(key.lastUsedAt)
                                : t("developer.never")}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--admin-muted)]">
                              {formatWhen(key.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "requests" ? (
              requests.length === 0 ? (
                <p className="text-sm text-[var(--admin-muted)]">
                  {t("developer.noRequests")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                      <tr>
                        <th className="pb-2 pr-3">{t("developer.colTime")}</th>
                        <th className="pb-2 pr-3">{t("developer.colKey")}</th>
                        <th className="pb-2 pr-3">{t("developer.colModel")}</th>
                        <th className="pb-2 pr-3">{t("developer.colStatus")}</th>
                        <th className="pb-2 pr-3">{t("developer.colLatency")}</th>
                        <th className="pb-2">{t("developer.colError")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-[var(--admin-border)]"
                        >
                          <td className="py-2 pr-3 text-xs text-[var(--admin-muted)]">
                            {formatWhen(row.created_at)}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.key_prefix ? `${row.key_prefix}…` : "—"}
                          </td>
                          <td className="py-2 pr-3">{row.model || "—"}</td>
                          <td className="py-2 pr-3 text-xs">{row.status}</td>
                          <td className="py-2 pr-3 tabular-nums text-xs">
                            {row.duration_ms} ms
                          </td>
                          <td className="py-2 text-xs text-[var(--status-bad-fg)]">
                            {row.error_message || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}

            {tab === "howto" ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--admin-muted)]">
                  {t("developer.curlHint")}
                </p>
                <p className="text-xs font-medium">
                  {t("developer.endpointGenerate")}
                  {" · "}
                  {t("developer.endpointModels")}
                </p>
                <pre className="overflow-x-auto rounded-xl bg-[var(--admin-surface-soft)] p-3 text-xs leading-relaxed">
                  {curl}
                </pre>
              </div>
            ) : null}
          </div>
        </AdminPanelCard>
      </main>
    </div>
  );
};
