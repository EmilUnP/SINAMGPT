"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FlaskConical, KeyRound, Shield } from "lucide-react";
import {
  AdminHint,
  AdminPanelCard,
  AdminSubtabs,
  adminBtnGhost,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/admin/AdminChrome";
import { CopyButton } from "@/components/chat/CopyButton";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { PageHeader } from "@/components/PageHeader";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLocale } from "@/components/LocaleProvider";
import { copyText, formatDateTime, usageStatusLabel } from "@/lib/ui";
import type { ApiKeyPublic } from "@/lib/api-keys";
import type { ApiUsageEvent } from "@/lib/api-usage";
import type { User } from "@/lib/types";

type Props = { user: User; devLabEnabled?: boolean };

type Tab = "keys" | "models" | "requests" | "howto";
type SnippetLang = "python" | "javascript" | "curl";

type CatalogModel = {
  name: string;
  display_name: string;
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  tts?: boolean;
  video?: boolean;
};

const snippetClass =
  "overflow-x-auto rounded-xl bg-[var(--admin-surface-soft)] p-3 text-xs leading-relaxed";

export const DeveloperConsole = ({ user, devLabEnabled = false }: Props) => {
  const { locale, t } = useLocale();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("keys");
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [defaultModel, setDefaultModel] = useState("gemma3:4b");
  const [exampleModel, setExampleModel] = useState("");
  const [maxKeys, setMaxKeys] = useState(5);
  const [gatewayOn, setGatewayOn] = useState(true);
  const [rpm, setRpm] = useState(30);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<ApiUsageEvent[]>([]);
  const [snippetLang, setSnippetLang] = useState<SnippetLang>("python");
  const [streamExample, setStreamExample] = useState(false);
  const [origin, setOrigin] = useState("http://localhost:3055");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [keysRes, usageRes, modelsRes] = await Promise.all([
        fetch("/api/developer/keys"),
        fetch("/api/developer/usage?limit=40"),
        fetch("/api/models"),
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
      const modelsData = (await modelsRes.json()) as {
        models?: CatalogModel[];
        defaultModel?: string;
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
      const catalog = modelsData.models ?? [];
      setModels(catalog);
      if (modelsData.defaultModel) setDefaultModel(modelsData.defaultModel);
      setExampleModel((current) => {
        if (current && catalog.some((m) => m.name === current)) return current;
        return modelsData.defaultModel || catalog[0]?.name || "";
      });
    } catch {
      setError(t("developer.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const activeCount = keys.filter((k) => !k.revokedAt).length;
  const baseUrl = `${origin}/api/v1`;
  const sampleKey = secret || "sinam_YOUR_KEY";
  const modelId = exampleModel || defaultModel || "gemma3:4b";

  const snippet = useMemo(() => {
    const prompt = "Hello from another SINAM app";
    if (snippetLang === "python") {
      if (streamExample) {
        return `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${sampleKey}")

stream = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "${prompt}"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)`;
      }
      return `from openai import OpenAI

client = OpenAI(base_url="${baseUrl}", api_key="${sampleKey}")

completion = client.chat.completions.create(
    model="${modelId}",
    messages=[{"role": "user", "content": "${prompt}"}],
)
print(completion.choices[0].message.content)`;
    }
    if (snippetLang === "javascript") {
      if (streamExample) {
        return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${sampleKey}",
});

const stream = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "${prompt}" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`;
      }
      return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "${sampleKey}",
});

const completion = await client.chat.completions.create({
  model: "${modelId}",
  messages: [{ role: "user", content: "${prompt}" }],
});
console.log(completion.choices[0].message.content);`;
    }
    const streamFlag = streamExample ? `"stream":true,` : `"stream":false,`;
    return `curl${streamExample ? " -N" : ""} ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelId}",${streamFlag}"messages":[{"role":"user","content":"${prompt}"}]}'`;
  }, [baseUrl, modelId, sampleKey, snippetLang, streamExample]);

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

  const handlePatch = async (
    id: string,
    body: { enabled?: boolean; revoke?: boolean },
  ) => {
    if (body.revoke) {
      const ok = await confirm({
        title: t("developer.revoke"),
        description: t("developer.revokeConfirm"),
        confirmLabel: t("developer.revoke"),
        tone: "danger",
      });
      if (!ok) return;
    }
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
    const ok = await copyText(secret);
    if (ok) setCopied(true);
  };

  const copyModelId = async (id: string) => {
    const ok = await copyText(id);
    if (!ok) return;
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1400);
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
      <PageHeader
        backLabel={t("developer.backToChat")}
        icon={KeyRound}
        title={t("developer.title")}
        badge={t("developer.badge")}
        subtitle={`${user.username} · ${t("common.brand")}`}
        links={
          user.role === "admin"
            ? [
                { href: "/admin", label: t("developer.admin"), icon: Shield },
                { href: "/lab", label: t("developer.lab"), icon: FlaskConical },
                ...(devLabEnabled
                  ? [{ href: "/devlab", label: t("developer.devLab") }]
                  : []),
              ]
            : []
        }
      />

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
                  id: "models",
                  label: t("developer.models"),
                  count: models.length,
                },
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
                  {t("developer.limitHint", {
                    used: activeCount,
                    max: maxKeys,
                  })}
                  {" · "}
                  {t("common.rpmShort", { n: rpm })}
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
                          <th className="pb-2 pr-3">
                            {t("developer.lastUsed")}
                          </th>
                          <th className="pb-2">{t("developer.created")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((key) => (
                          <tr
                            key={key.id}
                            className="border-t border-[var(--admin-border)]"
                          >
                            <td className="py-2.5 pr-3 font-medium">
                              {key.name}
                            </td>
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
                                      void handlePatch(key.id, {
                                        revoke: true,
                                      })
                                    }
                                  >
                                    {t("developer.revoke")}
                                  </button>
                                </span>
                              ) : null}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-[var(--admin-muted)]">
                              {key.lastUsedAt
                                ? formatDateTime(key.lastUsedAt, locale)
                                : t("developer.never")}
                            </td>
                            <td className="py-2.5 text-xs text-[var(--admin-muted)]">
                              {formatDateTime(key.createdAt, locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {tab === "models" ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--admin-muted)]">
                  {t("developer.modelsHint")}
                </p>
                {models.length === 0 ? (
                  <p className="text-sm text-[var(--admin-muted)]">
                    {t("developer.noModels")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                        <tr>
                          <th className="pb-2 pr-3">{t("developer.models")}</th>
                          <th className="pb-2 pr-3">{t("developer.modelId")}</th>
                          <th className="pb-2">{t("developer.copy")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map((model) => (
                          <tr
                            key={model.name}
                            className="border-t border-[var(--admin-border)]"
                          >
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">
                                {model.display_name || model.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <ModelCapabilityBadges
                                  showText
                                  size="sm"
                                  vision={model.vision}
                                  tools={model.tools}
                                  audio={model.audio}
                                  tts={model.tts}
                                  video={model.video}
                                />
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-xs">
                              {model.name}
                            </td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                className="text-xs text-[var(--accent)]"
                                onClick={() => void copyModelId(model.name)}
                              >
                                {copiedId === model.name
                                  ? t("developer.copied")
                                  : t("developer.copyId")}
                              </button>
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
                        <th className="pb-2 pr-3">
                          {t("developer.colStatus")}
                        </th>
                        <th className="pb-2 pr-3">
                          {t("developer.colLatency")}
                        </th>
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
                            {formatDateTime(row.created_at, locale)}
                          </td>
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
              )
            ) : null}

            {tab === "howto" ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--admin-muted)]">
                  {t("developer.sdkHint")}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--admin-muted)]">
                      {t("developer.baseUrl")}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="break-all rounded-lg bg-[var(--admin-surface-soft)] px-2 py-1 text-xs">
                        {baseUrl}
                      </code>
                      <CopyButton text={baseUrl} />
                    </div>
                  </div>
                  <label className="text-xs font-medium text-[var(--admin-muted)]">
                    {t("developer.pickModel")}
                    <select
                      value={modelId}
                      onChange={(e) => setExampleModel(e.target.value)}
                      className={adminFieldClass}
                    >
                      {models.length === 0 ? (
                        <option value={modelId}>{modelId}</option>
                      ) : (
                        models.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.display_name || model.name} · {model.name}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
                <p className="text-xs font-medium">
                  {t("developer.endpointCompletions")}
                  {" · "}
                  {t("developer.endpointModels")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["python", t("developer.snippetPython")],
                      ["javascript", t("developer.snippetJs")],
                      ["curl", t("developer.snippetCurl")],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSnippetLang(id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        snippetLang === id
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--admin-border)] text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <label className="ml-auto inline-flex items-center gap-2 text-xs text-[var(--admin-muted)]">
                    <input
                      type="checkbox"
                      checked={streamExample}
                      onChange={(e) => setStreamExample(e.target.checked)}
                    />
                    {t("developer.streamExample")}
                  </label>
                </div>
                <div className="relative">
                  <pre className={snippetClass}>{snippet}</pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton
                      text={snippet}
                      className="bg-[var(--admin-surface)] text-[var(--admin-fg)]"
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("developer.curlHint")}
                </p>
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("developer.generateNote")}{" "}
                  {t("developer.endpointGenerate")}
                </p>
              </div>
            ) : null}
          </div>
        </AdminPanelCard>
      </main>
    </div>
  );
};
