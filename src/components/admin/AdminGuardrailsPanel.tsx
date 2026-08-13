"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
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
} from "./AdminChrome";
import { useTranslations } from "@/components/LocaleProvider";
import type {
  GuardrailsConfig,
  PolicySuggestions,
} from "@/lib/guardrails";
import type { GuardrailEventRow } from "@/lib/guardrail-engine";
import type { MessageKey, TranslateVars } from "@/messages";

type TranslateFn = (key: MessageKey, vars?: TranslateVars) => string;

/** Client-safe mirror of server soft-policy prompt (no DB imports). */
const buildSoftPromptPreview = (
  config: GuardrailsConfig,
  t: TranslateFn,
): string => {
  const parts = [
    config.persona.trim() || t("admin.guardrails.emptyPersona"),
    "",
    t("admin.guardrails.multilingualReplyRules"),
    "",
    t("admin.guardrails.guardrailsMustFollow"),
  ];
  if (config.allowedTopics.trim()) {
    parts.push(
      t("admin.guardrails.youMayHelpWith", {
        value: config.allowedTopics.trim(),
      }),
    );
  }
  if (config.blockedTopics.trim()) {
    parts.push(
      t("admin.guardrails.youMustRefuse", {
        value: config.blockedTopics.trim(),
      }),
    );
  }
  if (config.extraRules.trim()) {
    parts.push(
      t("admin.guardrails.additionalRules", {
        value: config.extraRules.trim(),
      }),
    );
  }
  parts.push(
    t("admin.guardrails.refuseDisallowed"),
    t("admin.guardrails.neverJailbreaks"),
    t("admin.guardrails.neverAskSecrets"),
  );
  return parts.join("\n");
};

type Props = {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type GuardTab = "overview" | "policy" | "detectors";

/** Topics may be comma- or newline-separated in saved configs. */
const topicItems = (value: string) => {
  const byNl = value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (byNl.length > 1) return byNl;
  return value
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
};

const keywordItems = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const itemInList = (items: string[], needle: string) =>
  items.some((item) => item.toLowerCase() === needle.trim().toLowerCase());

const uniqueItems = (items: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

const toggleListItem = (
  current: string,
  item: string,
  kind: "topic" | "keyword",
) => {
  const trimmed = item.trim();
  if (!trimmed) return current;
  const parse = kind === "keyword" ? keywordItems : topicItems;
  const items = parse(current);
  const next = itemInList(items, trimmed)
    ? items.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())
    : [...items, trimmed];
  return next.join("\n");
};

const removeListItem = (
  current: string,
  item: string,
  kind: "topic" | "keyword",
) => {
  const trimmed = item.trim();
  if (!trimmed) return current;
  const parse = kind === "keyword" ? keywordItems : topicItems;
  return parse(current)
    .filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())
    .join("\n");
};

const emptySuggestions = (): PolicySuggestions => ({
  allowedTopics: [],
  blockedTopics: [],
  keywords: [],
  personaSnippets: [],
  extraRuleSnippets: [],
});

export const AdminGuardrailsPanel = ({ onNotice, onError }: Props) => {
  const t = useTranslations();
  const [tab, setTab] = useState<GuardTab>("overview");
  const [draft, setDraft] = useState<GuardrailsConfig | null>(null);
  const [saved, setSaved] = useState<GuardrailsConfig | null>(null);
  const [defaults, setDefaults] = useState<GuardrailsConfig | null>(null);
  const [events, setEvents] = useState<GuardrailEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [allowedDraft, setAllowedDraft] = useState("");
  const [blockedDraft, setBlockedDraft] = useState("");
  const [suggestions, setSuggestions] = useState<PolicySuggestions>(
    emptySuggestions,
  );
  const [builtinKeywordCount, setBuiltinKeywordCount] = useState(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/guardrails?events=40");
      const data = (await res.json()) as {
        guardrails?: GuardrailsConfig;
        defaults?: GuardrailsConfig;
        suggestions?: PolicySuggestions;
        builtinKeywordCount?: number;
        events?: GuardrailEventRow[];
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || t("admin.guardrails.failedLoad"));
        return;
      }
      if (data.guardrails) {
        setDraft(data.guardrails);
        setSaved(data.guardrails);
      }
      if (data.defaults) setDefaults(data.defaults);
      if (data.suggestions) setSuggestions(data.suggestions);
      if (typeof data.builtinKeywordCount === "number") {
        setBuiltinKeywordCount(data.builtinKeywordCount);
      }
      setEvents(data.events ?? []);
    } catch {
      onError(t("admin.guardrails.networkLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const update = <K extends keyof GuardrailsConfig>(
    key: K,
    value: GuardrailsConfig[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const insight = useMemo(() => {
    if (!draft) {
      return {
        keywordRules: 0,
        allowedTopics: 0,
        blockedTopics: 0,
        allowedList: [] as string[],
        blockedList: [] as string[],
        keywordList: [] as string[],
        personaChars: 0,
        promptChars: 0,
        promptPreview: "",
        differsFromDefault: {
          persona: false,
          allowed: false,
          blocked: false,
          keywords: false,
          refusal: false,
          extra: false,
        },
        detectorsOn: 0,
        detectorsTotal: 4,
        blocks: 0,
        warns: 0,
        guestShare: 0,
        topRules: [] as Array<{ title: string; count: number }>,
      };
    }

    const detectors = [
      draft.detectPromptInjection,
      draft.detectSecrets,
      draft.detectPiiPatterns,
      draft.logEvents,
    ];
    const blocks = events.filter((e) => e.decision === "block").length;
    const warns = events.filter((e) => e.decision === "warn").length;
    const guestShare =
      events.length > 0
        ? Math.round(
            (events.filter((e) => e.audience === "guest").length /
              events.length) *
              100,
          )
        : 0;

    const ruleCounts = new Map<string, number>();
    for (const ev of events) {
      try {
        const findings = JSON.parse(ev.findings_json || "[]") as Array<{
          title?: string;
          severity?: string;
        }>;
        for (const f of findings) {
          if (!f.title) continue;
          if (f.severity !== "block" && f.severity !== "warn") continue;
          ruleCounts.set(f.title, (ruleCounts.get(f.title) || 0) + 1);
        }
      } catch {
        /* ignore */
      }
    }
    const topRules = [...ruleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    const allowed = topicItems(draft.allowedTopics);
    const blocked = topicItems(draft.blockedTopics);
    const keywords = keywordItems(draft.blockedKeywords);
    const promptPreview = buildSoftPromptPreview(draft, t);
    const base = defaults;

    return {
      keywordRules: keywords.length,
      allowedTopics: allowed.length,
      blockedTopics: blocked.length,
      allowedList: allowed,
      blockedList: blocked,
      keywordList: keywords,
      personaChars: draft.persona.trim().length,
      promptChars: promptPreview.length,
      promptPreview,
      differsFromDefault: {
        persona: Boolean(
          base && draft.persona.trim() !== base.persona.trim(),
        ),
        allowed: Boolean(
          base && draft.allowedTopics.trim() !== base.allowedTopics.trim(),
        ),
        blocked: Boolean(
          base && draft.blockedTopics.trim() !== base.blockedTopics.trim(),
        ),
        keywords: Boolean(
          base && draft.blockedKeywords.trim() !== base.blockedKeywords.trim(),
        ),
        refusal: Boolean(
          base && draft.refusalMessage.trim() !== base.refusalMessage.trim(),
        ),
        extra: Boolean(
          base && draft.extraRules.trim() !== base.extraRules.trim(),
        ),
      },
      detectorsOn: detectors.filter(Boolean).length,
      detectorsTotal: detectors.length,
      blocks,
      warns,
      guestShare,
      topRules,
    };
  }, [draft, defaults, events, t]);

  const persistPolicy = useCallback(
    async (
      next: GuardrailsConfig,
      silent = false,
      nextSuggestions: PolicySuggestions = suggestions,
    ) => {
      setDraft(next);
      setSuggestions(nextSuggestions);
      setIsSaving(true);
      try {
        const res = await fetch("/api/admin/guardrails", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, suggestions: nextSuggestions }),
        });
        const data = (await res.json()) as {
          guardrails?: GuardrailsConfig;
          suggestions?: PolicySuggestions;
          error?: string;
        };
        if (!res.ok) {
          onError(data.error || t("admin.guardrails.couldNotSave"));
          return false;
        }
        if (data.guardrails) {
          setDraft(data.guardrails);
          setSaved(data.guardrails);
        }
        if (data.suggestions) setSuggestions(data.suggestions);
        if (!silent) onNotice(t("admin.guardrails.saved"));
        return true;
      } catch {
        onError(t("admin.guardrails.networkSave"));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [onError, onNotice, suggestions, t],
  );

  const handleSave = async () => {
    if (!draft) return;
    await persistPolicy(draft);
  };

  const applyTopicToggle = (
    field: "allowedTopics" | "blockedTopics",
    item: string,
  ) => {
    if (!draft) return;
    void persistPolicy(
      {
        ...draft,
        [field]: toggleListItem(draft[field], item, "topic"),
      },
      true,
    );
  };

  const applyKeywordToggle = (item: string) => {
    if (!draft) return;
    void persistPolicy(
      {
        ...draft,
        blockedKeywords: toggleListItem(draft.blockedKeywords, item, "keyword"),
      },
      true,
    );
  };

  const addListItem = (
    field: "allowedTopics" | "blockedTopics" | "blockedKeywords",
    catalogField: keyof PolicySuggestions,
    raw: string,
  ) => {
    if (!draft) return;
    const item = raw.trim();
    if (!item) return;
    const kind = field === "blockedKeywords" ? "keyword" : "topic";
    const current = draft[field];
    const nextText = itemInList(
      kind === "keyword" ? keywordItems(current) : topicItems(current),
      item,
    )
      ? current
      : toggleListItem(current, item, kind);
    void persistPolicy(
      { ...draft, [field]: nextText },
      true,
      {
        ...suggestions,
        [catalogField]: uniqueItems([...suggestions[catalogField], item]),
      },
    );
  };

  const removePaletteItem = (
    field: "allowedTopics" | "blockedTopics" | "blockedKeywords",
    catalogField: keyof PolicySuggestions,
    item: string,
  ) => {
    if (!draft) return;
    const kind = field === "blockedKeywords" ? "keyword" : "topic";
    const trimmed = item.trim();
    void persistPolicy(
      { ...draft, [field]: removeListItem(draft[field], item, kind) },
      true,
      {
        ...suggestions,
        [catalogField]: suggestions[catalogField].filter(
          (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
        ),
      },
    );
  };

  const renderToggles = (
    catalog: string[],
    active: string[],
    onToggle: (item: string) => void,
    onRemove: (item: string) => void,
    tone: "ok" | "bad" | "warn",
  ) => {
    const items = uniqueItems([...catalog, ...active]);
    if (!items.length) {
      return (
        <p className="text-sm text-[var(--admin-muted)]">
          {t("admin.guardrails.noItems")}
        </p>
      );
    }
    const onClass =
      tone === "ok"
        ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
        : tone === "bad"
          ? "border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] text-[var(--status-bad-fg)]"
          : "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]";
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const on = itemInList(active, item);
          return (
            <span
              key={item}
              className={`inline-flex max-w-full items-center rounded-lg border text-[11px] ${
                on
                  ? onClass
                  : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-muted)]"
              }`}
            >
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onToggle(item)}
                title={
                  on
                    ? t("admin.guardrails.turnOff")
                    : t("admin.guardrails.turnOn")
                }
                className="inline-flex min-w-0 items-center gap-1.5 px-2 py-1 text-left transition hover:opacity-90 disabled:opacity-50"
              >
                <span className="shrink-0 font-semibold">
                  {on
                    ? t("admin.guardrails.activeOn")
                    : t("admin.guardrails.activeOff")}
                </span>
                <span className="min-w-0 truncate">{item}</span>
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => onRemove(item)}
                title={t("admin.guardrails.remove")}
                aria-label={t("admin.guardrails.remove")}
                className="shrink-0 rounded-r-lg px-1.5 py-1 text-[var(--admin-muted)] transition hover:bg-[var(--status-bad-bg)] hover:text-[var(--status-bad-fg)] disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
      </div>
    );
  };

  const handleReset = async () => {
    if (!window.confirm(t("admin.guardrails.resetConfirm"))) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/guardrails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = (await res.json()) as {
        guardrails?: GuardrailsConfig;
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || t("admin.guardrails.couldNotReset"));
        return;
      }
      if (data.guardrails) {
        setDraft(data.guardrails);
        setSaved(data.guardrails);
      }
      onNotice(t("admin.guardrails.resetDone"));
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !draft) {
    return (
      <AdminPanelCard className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
        {t("admin.guardrails.loading")}
      </AdminPanelCard>
    );
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const saveBar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--admin-border)] px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleReset()}
          className={adminBtnGhost}
        >
          {t("admin.guardrails.resetDefaults")}
        </button>
        <p className="max-w-md text-[11px] text-[var(--admin-muted)]">
          {isDirty
            ? t("admin.guardrails.unsavedHint")
            : t("admin.guardrails.liveHint")}
        </p>
      </div>
      <button
        type="button"
        disabled={isSaving || !isDirty}
        onClick={() => void handleSave()}
        className={adminBtnPrimary}
      >
        {isSaving ? t("admin.chrome.saving") : t("admin.chrome.saveChanges")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={ShieldAlert}
            title={t("admin.guardrails.title")}
            description={t("admin.guardrails.description")}
            actions={
              <span
                className={`status-pill ${draft.enabled ? "status-ok" : "status-warn"}`}
              >
                {draft.enabled
                  ? t("admin.guardrails.active")
                  : t("admin.guardrails.paused")}
              </span>
            }
          />
          <AdminSubtabs
            active={tab}
            onChange={setTab}
            tabs={[
              {
                id: "overview",
                label: t("admin.guardrails.tabOverview"),
                icon: Sparkles,
              },
              {
                id: "policy",
                label: t("admin.guardrails.tabPolicy"),
                icon: SlidersHorizontal,
              },
              {
                id: "detectors",
                label: t("admin.guardrails.tabDetectors"),
                icon: ShieldCheck,
                count: `${insight.detectorsOn}/${insight.detectorsTotal}`,
              },
            ]}
          />
        </div>

        {tab === "overview" ? (
          <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
            <AdminStatGrid>
              <AdminStatCard
                label={t("admin.guardrails.status")}
                value={
                  draft.enabled
                    ? t("admin.guardrails.statusOn")
                    : t("admin.guardrails.statusOff")
                }
                hint={
                  draft.enabled
                    ? `${draft.applyToUsers ? t("admin.guardrails.users") : "—"}${draft.applyToGuests ? ` · ${t("admin.guardrails.guests")}` : ""}`
                    : t("admin.guardrails.noHardChecks")
                }
                tone={draft.enabled ? "ok" : "warn"}
              />
              <AdminStatCard
                label={t("admin.guardrails.hardKeywords")}
                value={insight.keywordRules}
                hint={t("admin.guardrails.keywordsHint")}
                tone="info"
              />
              <AdminStatCard
                label={t("admin.guardrails.recentBlocks")}
                value={insight.blocks}
                hint={t("admin.guardrails.warnsHint", {
                  n: insight.warns,
                  total: events.length,
                })}
                tone={insight.blocks > 0 ? "bad" : "default"}
              />
              <AdminStatCard
                label={t("admin.guardrails.guestShare")}
                value={events.length ? `${insight.guestShare}%` : "—"}
                hint={t("admin.guardrails.guestShareHint")}
              />
            </AdminStatGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.guardrails.stackCoverage")}
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    {
                      id: "promptInjection",
                      label: t("admin.guardrails.promptInjection"),
                      on: draft.detectPromptInjection,
                      detail: t("admin.guardrails.promptInjectionDetail"),
                    },
                    {
                      id: "secrets",
                      label: t("admin.guardrails.secrets"),
                      on: draft.detectSecrets,
                      detail: t("admin.guardrails.secretsDetail"),
                    },
                    {
                      id: "pii",
                      label: t("admin.guardrails.pii"),
                      on: draft.detectPiiPatterns,
                      detail: draft.strictPii
                        ? t("admin.guardrails.piiStrict")
                        : t("admin.guardrails.piiWarn"),
                    },
                    {
                      id: "eventLogging",
                      label: t("admin.guardrails.eventLogging"),
                      on: draft.logEvents,
                      detail: t("admin.guardrails.eventLoggingDetail"),
                    },
                  ].map((row) => (
                    <li
                      key={row.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-[var(--admin-surface-soft)] px-3 py-2"
                    >
                      <span>
                        <span className="block font-medium text-[var(--admin-fg)]">
                          {row.label}
                        </span>
                        <span className="text-xs text-[var(--admin-muted)]">
                          {row.detail}
                        </span>
                      </span>
                      <span
                        className={`status-pill shrink-0 ${row.on ? "status-ok" : "status-info"}`}
                      >
                        {row.on ? t("admin.chrome.on") : t("admin.chrome.off")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                    {t("admin.guardrails.topMatched")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {t("admin.chrome.refresh")}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  {t("admin.guardrails.fromRecent", {
                    allowed: insight.allowedTopics,
                    blocked: insight.blockedTopics,
                  })}
                </p>
                {insight.topRules.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--admin-muted)]">
                    {t("admin.guardrails.noBlocksYet")}
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--admin-border)]">
                    {insight.topRules.map((r) => (
                      <li
                        key={r.title}
                        className="flex items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span className="truncate text-[var(--admin-fg)]">
                          {r.title}
                        </span>
                        <span className="tabular-nums text-[var(--admin-muted)]">
                          {r.count}×
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.guardrails.policySnapshot")}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab("policy")}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  {t("admin.guardrails.editPolicy")}
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-[var(--admin-fg)]">
                {draft.persona.trim() || t("admin.guardrails.noPersona")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-[var(--admin-muted)]">
                  {t("admin.guardrails.allowedTopicsN", {
                    n: insight.allowedTopics,
                  })}
                </span>
                <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-[var(--admin-muted)]">
                  {t("admin.guardrails.refuseTopicsN", {
                    n: insight.blockedTopics,
                  })}
                </span>
                <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-[var(--admin-muted)]">
                  {t("admin.guardrails.hardKeywordsN", {
                    n: insight.keywordRules,
                  })}
                </span>
                <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-[var(--admin-muted)]">
                  {t("admin.guardrails.promptChars", {
                    n: insight.promptChars,
                  })}
                </span>
              </div>
            </div>

            <AdminHint>
              <strong className="text-[var(--admin-fg)]">
                {t("admin.guardrails.layersLabel")}
              </strong>{" "}
              {t("admin.guardrails.layersHint", {
                n: builtinKeywordCount || "—",
              })}
            </AdminHint>
          </div>
        ) : null}

        {tab === "policy" ? (
          <>
            <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
              <AdminStatGrid>
                <AdminStatCard
                  label={t("admin.guardrails.persona")}
                  value={`${insight.personaChars}`}
                  hint={
                    insight.differsFromDefault.persona
                      ? t("admin.guardrails.charsCustomized")
                      : t("admin.guardrails.charsDefault")
                  }
                  tone="info"
                />
                <AdminStatCard
                  label={t("admin.guardrails.allowedTopics")}
                  value={insight.allowedTopics}
                  hint={t("admin.guardrails.softSteers")}
                />
                <AdminStatCard
                  label={t("admin.guardrails.refuseTopics")}
                  value={insight.blockedTopics}
                  hint={t("admin.guardrails.softSteers")}
                />
                <AdminStatCard
                  label={t("admin.guardrails.hardKeywords")}
                  value={insight.keywordRules}
                  hint={t("admin.guardrails.builtinPlusCustom", {
                    n: builtinKeywordCount || "—",
                  })}
                  tone={insight.keywordRules > 0 ? "warn" : "default"}
                />
              </AdminStatGrid>

              <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)]/60 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                      {t("admin.guardrails.voicePersona")}
                    </h3>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {t("admin.guardrails.voiceHint")}
                    </p>
                  </div>
                  {insight.differsFromDefault.persona ? (
                    <span className="status-pill status-info">
                      {t("admin.guardrails.customized")}
                    </span>
                  ) : (
                    <span className="status-pill status-neutral">
                      {t("admin.guardrails.defaultBadge")}
                    </span>
                  )}
                </div>
                <textarea
                  value={draft.persona}
                  onChange={(e) => update("persona", e.target.value)}
                  rows={3}
                  className={`${adminFieldClass} resize-y`}
                  placeholder={t("admin.guardrails.personaPlaceholder")}
                />
              </div>

              <p className="text-xs text-[var(--admin-muted)]">
                {t("admin.guardrails.toggleLegend")}
              </p>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--admin-border)] p-4">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                      {t("admin.guardrails.canHelp")}
                    </h3>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {t("admin.guardrails.activeCount", {
                        on: insight.allowedTopics,
                        off: Math.max(
                          0,
                          uniqueItems([
                            ...suggestions.allowedTopics,
                            ...insight.allowedList,
                          ]).length - insight.allowedTopics,
                        ),
                      })}
                    </p>
                  </div>
                  {renderToggles(
                    suggestions.allowedTopics,
                    insight.allowedList,
                    (item) => applyTopicToggle("allowedTopics", item),
                    (item) =>
                      removePaletteItem(
                        "allowedTopics",
                        "allowedTopics",
                        item,
                      ),
                    "ok",
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={allowedDraft}
                      onChange={(e) => setAllowedDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addListItem(
                          "allowedTopics",
                          "allowedTopics",
                          allowedDraft,
                        );
                        setAllowedDraft("");
                      }}
                      placeholder={t("admin.guardrails.addTopic")}
                      className={`${adminFieldClass} mt-0 min-w-[12rem] flex-1`}
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        addListItem(
                          "allowedTopics",
                          "allowedTopics",
                          allowedDraft,
                        );
                        setAllowedDraft("");
                      }}
                      className={adminBtnGhost}
                    >
                      <Plus size={14} />
                      {t("admin.guardrails.add")}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--admin-border)] p-4">
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                      {t("admin.guardrails.mustRefuse")}
                    </h3>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {t("admin.guardrails.activeCount", {
                        on: insight.blockedTopics,
                        off: Math.max(
                          0,
                          uniqueItems([
                            ...suggestions.blockedTopics,
                            ...insight.blockedList,
                          ]).length - insight.blockedTopics,
                        ),
                      })}
                    </p>
                  </div>
                  {renderToggles(
                    suggestions.blockedTopics,
                    insight.blockedList,
                    (item) => applyTopicToggle("blockedTopics", item),
                    (item) =>
                      removePaletteItem(
                        "blockedTopics",
                        "blockedTopics",
                        item,
                      ),
                    "bad",
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={blockedDraft}
                      onChange={(e) => setBlockedDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addListItem(
                          "blockedTopics",
                          "blockedTopics",
                          blockedDraft,
                        );
                        setBlockedDraft("");
                      }}
                      placeholder={t("admin.guardrails.addTopic")}
                      className={`${adminFieldClass} mt-0 min-w-[12rem] flex-1`}
                    />
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        addListItem(
                          "blockedTopics",
                          "blockedTopics",
                          blockedDraft,
                        );
                        setBlockedDraft("");
                      }}
                      className={adminBtnGhost}
                    >
                      <Plus size={14} />
                      {t("admin.guardrails.add")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--admin-border)] p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                      {t("admin.guardrails.hardBlockedKeywords")}
                    </h3>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {t("admin.guardrails.hardBlockedHint", {
                        n: builtinKeywordCount || "—",
                      })}
                    </p>
                  </div>
                  <span className="status-pill status-warn">
                    {t("admin.guardrails.customCount", {
                      n: insight.keywordRules,
                    })}
                  </span>
                </div>

                <p className="mb-3 text-xs text-[var(--admin-muted)]">
                  {t("admin.guardrails.activeCount", {
                    on: insight.keywordRules,
                    off: Math.max(
                      0,
                      uniqueItems([
                        ...suggestions.keywords,
                        ...insight.keywordList,
                      ]).length - insight.keywordRules,
                    ),
                  })}
                </p>
                {renderToggles(
                  suggestions.keywords,
                  insight.keywordList,
                  applyKeywordToggle,
                  (item) =>
                    removePaletteItem("blockedKeywords", "keywords", item),
                  "warn",
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      addListItem(
                        "blockedKeywords",
                        "keywords",
                        keywordDraft,
                      );
                      setKeywordDraft("");
                    }}
                    placeholder={t("admin.guardrails.addPhrase")}
                    className={`${adminFieldClass} mt-0 min-w-[12rem] flex-1`}
                  />
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      addListItem(
                        "blockedKeywords",
                        "keywords",
                        keywordDraft,
                      );
                      setKeywordDraft("");
                    }}
                    className={adminBtnGhost}
                  >
                    <Plus size={14} />
                    {t("admin.guardrails.add")}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-[var(--admin-border)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                    {t("admin.guardrails.refusalMessage")}
                  </h3>
                  <p className="mb-2 text-xs text-[var(--admin-muted)]">
                    {t("admin.guardrails.refusalHint")}
                  </p>
                  <textarea
                    value={draft.refusalMessage}
                    onChange={(e) => update("refusalMessage", e.target.value)}
                    rows={4}
                    className={`${adminFieldClass} resize-y`}
                  />
                </div>
                <div className="rounded-xl border border-[var(--admin-border)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                    {t("admin.guardrails.extraRules")}
                  </h3>
                  <p className="mb-2 text-xs text-[var(--admin-muted)]">
                    {t("admin.guardrails.extraRulesHint")}
                  </p>
                  <textarea
                    value={draft.extraRules}
                    onChange={(e) => update("extraRules", e.target.value)}
                    rows={4}
                    className={`${adminFieldClass} resize-y`}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--admin-border)]">
                <button
                  type="button"
                  onClick={() => setShowPromptPreview((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-[var(--admin-fg)]">
                      {t("admin.guardrails.modelSees")}
                    </span>
                    <span className="text-xs text-[var(--admin-muted)]">
                      {t("admin.guardrails.modelSeesHint", {
                        n: insight.promptChars,
                      })}
                    </span>
                  </span>
                  {showPromptPreview ? (
                    <ChevronDown size={16} className="text-[var(--admin-muted)]" />
                  ) : (
                    <ChevronRight size={16} className="text-[var(--admin-muted)]" />
                  )}
                </button>
                {showPromptPreview ? (
                  <pre className="max-h-72 overflow-auto border-t border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-4 py-3 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--admin-muted)]">
                    {insight.promptPreview}
                  </pre>
                ) : null}
              </div>
            </div>
            {saveBar}
          </>
        ) : null}

        {tab === "detectors" ? (
          <>
            <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <AdminToggleCard
                  emphasize
                  checked={draft.enabled}
                  onChange={(v) => update("enabled", v)}
                  label={t("admin.guardrails.guardrailsOn")}
                  hint={t("admin.guardrails.guardrailsOnHint")}
                />
                <AdminToggleCard
                  checked={draft.applyToGuests}
                  onChange={(v) => update("applyToGuests", v)}
                  label={t("admin.guardrails.applyGuests")}
                  hint={t("admin.guardrails.applyGuestsHint")}
                />
                <AdminToggleCard
                  checked={draft.applyToUsers}
                  onChange={(v) => update("applyToUsers", v)}
                  label={t("admin.guardrails.applyLoggedIn")}
                  hint={t("admin.guardrails.applyLoggedInHint")}
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.guardrails.specialDetectors")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminToggleCard
                    checked={draft.detectPromptInjection}
                    onChange={(v) => update("detectPromptInjection", v)}
                    label={t("admin.guardrails.promptJailbreak")}
                    hint={t("admin.guardrails.promptJailbreakHint")}
                  />
                  <AdminToggleCard
                    checked={draft.detectSecrets}
                    onChange={(v) => update("detectSecrets", v)}
                    label={t("admin.guardrails.secretsCreds")}
                    hint={t("admin.guardrails.secretsCredsHint")}
                  />
                  <AdminToggleCard
                    checked={draft.detectPiiPatterns}
                    onChange={(v) => update("detectPiiPatterns", v)}
                    label={t("admin.guardrails.pii")}
                    hint={t("admin.guardrails.piiHint")}
                  />
                  <AdminToggleCard
                    checked={draft.strictPii}
                    onChange={(v) => update("strictPii", v)}
                    label={t("admin.guardrails.strictPii")}
                    hint={t("admin.guardrails.strictPiiHint")}
                  />
                  <AdminToggleCard
                    checked={draft.logEvents}
                    onChange={(v) => update("logEvents", v)}
                    label={t("admin.guardrails.logBlocks")}
                    hint={t("admin.guardrails.logBlocksHint")}
                  />
                </div>
              </div>
            </div>
            {saveBar}
          </>
        ) : null}
      </AdminPanelCard>
    </div>
  );
};
