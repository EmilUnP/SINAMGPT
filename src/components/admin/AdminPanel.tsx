"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  KeyRound,
  Gauge,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  Timer,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Zap,
} from "lucide-react";
import { AdminGuardrailsPanel } from "./AdminGuardrailsPanel";
import { AdminKnowledgePanel } from "./AdminKnowledgePanel";
import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { AdminUsagePanel } from "./AdminUsagePanel";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { PageHeader } from "@/components/PageHeader";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALE_BCP47 } from "@/lib/locale";
import type { AdminUserRow, User } from "@/lib/types";

type Totals = {
  total_users: number;
  active_users: number;
  total_conversations: number;
  total_messages: number;
  total_user_messages: number;
};

type BackendPulse = {
  backend: "ollama" | "vllm";
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl?: string;
};

type OverviewPulse = {
  liveCount: number;
  ollama: { ok: boolean; latencyMs: number; error?: string; backend?: string };
  backends: BackendPulse[];
  summary: {
    total_requests: number | null;
    ok_requests: number | null;
    error_requests: number | null;
    guest_requests: number | null;
    user_requests: number | null;
    avg_duration_ms: number | null;
    avg_ttft_ms: number | null;
    avg_tokens_per_sec: number | null;
    requests_24h: number | null;
    requests_7d: number | null;
    requests_today: number | null;
  };
  byHour: Array<{ hour: string; requests: number }>;
  byModel: Array<{
    model: string;
    requests: number;
    avg_tokens_per_sec: number | null;
  }>;
  topUsers: Array<{
    username: string;
    source: "user" | "guest";
    requests: number;
  }>;
};

type OverviewMeta = {
  knowledgeDocs: number;
  knowledgeEnabled: number;
  knowledgeOn: boolean;
  guardrailsOn: boolean;
  keywordRules: number;
};

type ManagedModel = {
  name: string;
  size: number;
  modified_at: string;
  is_enabled: boolean;
  display_name: string;
  backend?: "ollama" | "vllm";
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  video?: boolean;
};

type AppSettings = {
  guestEnabled: boolean;
  guestDailyLimit: number;
  guestMaxMessageChars: number;
  guestHistoryLimit: number;
  registrationEnabled: boolean;
  defaultModel: string;
  userMaxMessageChars: number;
  userHistoryLimit: number;
  temperature: number;
  numPredict: number;
  topP: number;
  loggedInUnlimited: boolean;
  developerApiEnabled: boolean;
  devLabEnabled: boolean;
  fileUploadEnabled: boolean;
  fileImportEnabled: boolean;
  microphoneEnabled: boolean;
};

type TabId =
  | "overview"
  | "usage"
  | "users"
  | "models"
  | "knowledge"
  | "guardrails"
  | "settings";

type AdminPanelProps = {
  admin: User;
};

const formatSize = (bytes: number) => {
  if (!bytes) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

const fmtNum = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
};

const USER_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const countLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;

const withinDays = (value: string | null, days: number) => {
  if (!value) return false;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
};

export const AdminPanel = ({ admin }: AdminPanelProps) => {
  const { locale, t } = useLocale();
  const fmtMs = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    if (value < 1000) return t("common.ms", { n: Math.round(value) });
    return t("common.sec", { n: (value / 1000).toFixed(1) });
  };
  const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> =
    [
      { id: "overview", label: t("admin.tabs.overview"), icon: LayoutDashboard },
      { id: "usage", label: t("admin.tabs.usage"), icon: Activity },
      { id: "users", label: t("admin.tabs.users"), icon: Users },
      { id: "models", label: t("admin.tabs.models"), icon: Bot },
      { id: "knowledge", label: t("admin.tabs.knowledge"), icon: BookOpen },
      {
        id: "guardrails",
        label: t("admin.tabs.guardrails"),
        icon: ShieldAlert,
      },
      { id: "settings", label: t("admin.tabs.settings"), icon: Settings2 },
    ];

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(LOCALE_BCP47[locale]);
  };

  const [tab, setTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pulse, setPulse] = useState<OverviewPulse | null>(null);
  const [meta, setMeta] = useState<OverviewMeta | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    guestEnabled: true,
    guestDailyLimit: "5",
    guestMaxMessageChars: "2000",
    guestHistoryLimit: "10",
    registrationEnabled: true,
    defaultModel: "",
    userMaxMessageChars: "5000",
    userHistoryLimit: "40",
    temperature: "0.7",
    numPredict: "-1",
    topP: "0.9",
    developerApiEnabled: false,
    devLabEnabled: false,
    fileUploadEnabled: false,
    fileImportEnabled: false,
    microphoneEnabled: false,
  });
  const [userQuery, setUserQuery] = useState("");
  const [userFilter, setUserFilter] = useState<"all" | "active" | "disabled" | "admin">(
    "all",
  );
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState<
    (typeof USER_PAGE_SIZE_OPTIONS)[number]
  >(25);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [displayDrafts, setDisplayDrafts] = useState<Record<string, string>>(
    {},
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [usersRes, modelsRes, settingsRes, usageRes, knowledgeRes, guardRes] =
        await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/models"),
          fetch("/api/admin/settings"),
          fetch("/api/admin/usage", { cache: "no-store" }),
          fetch("/api/admin/knowledge"),
          fetch("/api/admin/guardrails"),
        ]);

      const usersData = (await usersRes.json()) as {
        users?: AdminUserRow[];
        totals?: Totals;
        error?: string;
      };
      const modelsData = (await modelsRes.json()) as {
        models?: ManagedModel[];
        error?: string;
      };
      const settingsData = (await settingsRes.json()) as {
        settings?: AppSettings;
        error?: string;
      };
      const usageData = (await usageRes.json()) as {
        live?: Array<{ id: string }>;
        ollama?: OverviewPulse["ollama"];
        backends?: BackendPulse[];
        analytics?: {
          summary?: OverviewPulse["summary"];
          byHour?: OverviewPulse["byHour"];
          byModel?: OverviewPulse["byModel"];
          topUsers?: OverviewPulse["topUsers"];
        };
        error?: string;
      };
      const knowledgeData = (await knowledgeRes.json()) as {
        docs?: Array<{ is_enabled: number }>;
        settings?: { enabled: boolean };
        error?: string;
      };
      const guardData = (await guardRes.json()) as {
        guardrails?: {
          enabled: boolean;
          blockedKeywords: string;
        };
        error?: string;
      };

      if (!usersRes.ok) {
        setError(usersData.error || t("admin.users.failedLoad"));
        return;
      }
      if (!modelsRes.ok && modelsData.error) {
        setError(modelsData.error);
      }
      if (!settingsRes.ok) {
        setError(settingsData.error || t("admin.settings.failedLoad"));
        return;
      }

      setUsers(usersData.users ?? []);
      setTotals(usersData.totals ?? null);
      setModels(modelsData.models ?? []);
      setDisplayDrafts(
        Object.fromEntries(
          (modelsData.models ?? []).map((m) => [
            m.name,
            m.display_name || m.name,
          ]),
        ),
      );
      if (settingsData.settings) {
        const s = settingsData.settings;
        setSettings(s);
        setSettingsDraft({
          guestEnabled: s.guestEnabled ?? true,
          guestDailyLimit: String(s.guestDailyLimit),
          guestMaxMessageChars: String(s.guestMaxMessageChars),
          guestHistoryLimit: String(s.guestHistoryLimit ?? 10),
          registrationEnabled: s.registrationEnabled ?? true,
          defaultModel: s.defaultModel ?? "",
          userMaxMessageChars: String(s.userMaxMessageChars ?? 5000),
          userHistoryLimit: String(s.userHistoryLimit ?? 40),
          temperature: String(s.temperature ?? 0.7),
          numPredict: String(s.numPredict ?? -1),
          topP: String(s.topP ?? 0.9),
          developerApiEnabled: s.developerApiEnabled === true,
          devLabEnabled: s.devLabEnabled === true,
          fileUploadEnabled: s.fileUploadEnabled === true,
          fileImportEnabled: s.fileImportEnabled === true,
          microphoneEnabled: s.microphoneEnabled === true,
        });
      }

      if (usageRes.ok && usageData.analytics?.summary && usageData.ollama) {
        setPulse({
          liveCount: usageData.live?.length ?? 0,
          ollama: usageData.ollama,
          backends: usageData.backends ?? [
            {
              backend: "ollama",
              ok: usageData.ollama.ok,
              latencyMs: usageData.ollama.latencyMs,
              error: usageData.ollama.error,
            },
          ],
          summary: usageData.analytics.summary,
          byHour: usageData.analytics.byHour ?? [],
          byModel: (usageData.analytics.byModel ?? []).slice(0, 5),
          topUsers: (usageData.analytics.topUsers ?? []).slice(0, 5),
        });
      }

      if (knowledgeRes.ok || guardRes.ok) {
        const docs = knowledgeData.docs ?? [];
        setMeta({
          knowledgeDocs: docs.length,
          knowledgeEnabled: docs.filter((d) => d.is_enabled === 1).length,
          knowledgeOn: knowledgeData.settings?.enabled ?? false,
          guardrailsOn: guardData.guardrails?.enabled ?? false,
          keywordRules: countLines(guardData.guardrails?.blockedKeywords ?? ""),
        });
      }
    } catch {
      setError(t("admin.users.networkLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (userFilter === "active" && user.is_active !== 1) return false;
      if (userFilter === "disabled" && user.is_active === 1) return false;
      if (userFilter === "admin" && user.role !== "admin") return false;
      if (!q) return true;
      return user.username.toLowerCase().includes(q);
    });
  }, [users, userQuery, userFilter]);

  const userTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / userPageSize),
  );
  const safeUserPage = Math.min(userPage, userTotalPages);
  const pagedUsers = useMemo(() => {
    const start = (safeUserPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, safeUserPage, userPageSize]);
  const userRangeStart =
    filteredUsers.length === 0 ? 0 : (safeUserPage - 1) * userPageSize + 1;
  const userRangeEnd = Math.min(
    safeUserPage * userPageSize,
    filteredUsers.length,
  );

  /*
   * Changing a filter restarts pagination. Resetting in the handler keeps it
   * in the same commit as the filter change; an effect would render once with
   * the stale page first. An over-range page needs no effect at all —
   * safeUserPage clamps during render and every consumer reads safeUserPage.
   */
  const changeUserQuery = (value: string) => {
    setUserQuery(value);
    setUserPage(1);
  };
  const changeUserFilter = (
    value: "all" | "active" | "disabled" | "admin",
  ) => {
    setUserFilter(value);
    setUserPage(1);
  };
  const changeUserPageSize = (
    value: (typeof USER_PAGE_SIZE_OPTIONS)[number],
  ) => {
    setUserPageSize(value);
    setUserPage(1);
  };

  const enabledModels = useMemo(
    () => models.filter((m) => m.is_enabled).length,
    [models],
  );
  const sortedModels = useMemo(
    () =>
      [...models].sort((a, b) => {
        if (a.is_enabled !== b.is_enabled) return a.is_enabled ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [models],
  );
  const disabledUsers = useMemo(
    () => users.filter((u) => u.is_active !== 1).length,
    [users],
  );
  const adminUsers = useMemo(
    () => users.filter((u) => u.role === "admin").length,
    [users],
  );
  const activeLast7d = useMemo(
    () => users.filter((u) => withinDays(u.last_active_at, 7)).length,
    [users],
  );
  const errorRate = useMemo(() => {
    const total = pulse?.summary.total_requests ?? 0;
    const errors = pulse?.summary.error_requests ?? 0;
    if (!total) return null;
    return Math.round((errors / total) * 1000) / 10;
  }, [pulse]);
  const maxHourRequests = useMemo(
    () => Math.max(1, ...(pulse?.byHour.map((h) => h.requests) ?? [1])),
    [pulse],
  );

  const handleToggleActive = async (user: AdminUserRow) => {
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: user.is_active !== 1 }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || t("admin.users.updateFailed"));
        return;
      }
      setNotice(
        user.is_active === 1
          ? t("admin.users.nowDisabled", { name: user.username })
          : t("admin.users.nowEnabled", { name: user.username }),
      );
      await load();
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user: AdminUserRow) => {
    if (
      !window.confirm(
        t("admin.users.deleteConfirm", { name: user.username }),
      )
    ) {
      return;
    }

    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || t("admin.users.deleteFailed"));
        return;
      }
      setNotice(t("admin.users.deleted", { name: user.username }));
      await load();
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleModel = async (model: ManagedModel) => {
    setBusyModel(model.name);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: model.name,
          is_enabled: !model.is_enabled,
        }),
      });
      const data = (await res.json()) as {
        models?: ManagedModel[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("admin.models.couldNotUpdate"));
        return;
      }
      setModels(data.models ?? []);
      if (data.models) {
        setDisplayDrafts(
          Object.fromEntries(
            data.models.map((m) => [m.name, m.display_name || m.name]),
          ),
        );
      }
      setNotice(
        !model.is_enabled
          ? t("admin.models.nowEnabled", { name: model.name })
          : t("admin.models.nowDisabled", { name: model.name }),
      );
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyModel(null);
    }
  };

  const handleSaveDisplayName = async (model: ManagedModel) => {
    const next = (displayDrafts[model.name] ?? "").trim();
    const current = (model.display_name || model.name).trim();
    if (next === current) {
      setNotice(t("admin.models.displayUnchanged"));
      return;
    }

    setBusyModel(model.name);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: model.name,
          display_name: next,
        }),
      });
      const data = (await res.json()) as {
        models?: ManagedModel[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("admin.models.couldNotSaveName"));
        return;
      }
      setModels(data.models ?? []);
      if (data.models) {
        setDisplayDrafts(
          Object.fromEntries(
            data.models.map((m) => [m.name, m.display_name || m.name]),
          ),
        );
      }
      setNotice(
        next
          ? `“${model.name}” will show as “${next}”`
          : t("admin.models.resetToId", { name: model.name }),
      );
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyModel(null);
    }
  };

  const handleSaveSettings = async () => {
    const guestDailyLimit = Number(settingsDraft.guestDailyLimit);
    const guestMaxMessageChars = Number(settingsDraft.guestMaxMessageChars);
    const guestHistoryLimit = Number(settingsDraft.guestHistoryLimit);
    const userMaxMessageChars = Number(settingsDraft.userMaxMessageChars);
    const userHistoryLimit = Number(settingsDraft.userHistoryLimit);
    const temperature = Number(settingsDraft.temperature);
    const numPredict = Number(settingsDraft.numPredict);
    const topP = Number(settingsDraft.topP);

    if (!Number.isFinite(guestDailyLimit) || guestDailyLimit < 0 || guestDailyLimit > 1000) {
      setError(t("admin.settings.errGuestLimit"));
      return;
    }
    if (
      !Number.isFinite(guestMaxMessageChars) ||
      guestMaxMessageChars < 100 ||
      guestMaxMessageChars > 20000
    ) {
      setError(t("admin.settings.errGuestChars"));
      return;
    }
    if (
      !Number.isFinite(guestHistoryLimit) ||
      guestHistoryLimit < 0 ||
      guestHistoryLimit > 40
    ) {
      setError(t("admin.settings.errGuestHistory"));
      return;
    }
    if (
      !Number.isFinite(userMaxMessageChars) ||
      userMaxMessageChars < 500 ||
      userMaxMessageChars > 32000
    ) {
      setError(t("admin.settings.errUserChars"));
      return;
    }
    if (
      !Number.isFinite(userHistoryLimit) ||
      userHistoryLimit < 0 ||
      userHistoryLimit > 200
    ) {
      setError(t("admin.settings.errUserHistory"));
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setError(t("admin.settings.errTemp"));
      return;
    }
    if (
      !Number.isFinite(numPredict) ||
      numPredict < -1 ||
      numPredict > 8192
    ) {
      setError(t("admin.settings.errTokens"));
      return;
    }
    if (!Number.isFinite(topP) || topP < 0.05 || topP > 1) {
      setError(t("admin.settings.errTopP"));
      return;
    }

    setSavingSettings(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestEnabled: settingsDraft.guestEnabled,
          guestDailyLimit: Math.floor(guestDailyLimit),
          guestMaxMessageChars: Math.floor(guestMaxMessageChars),
          guestHistoryLimit: Math.floor(guestHistoryLimit),
          registrationEnabled: settingsDraft.registrationEnabled,
          defaultModel: settingsDraft.defaultModel.trim(),
          userMaxMessageChars: Math.floor(userMaxMessageChars),
          userHistoryLimit: Math.floor(userHistoryLimit),
          temperature,
          numPredict: Math.floor(numPredict),
          topP,
          developerApiEnabled: settingsDraft.developerApiEnabled,
          devLabEnabled: settingsDraft.devLabEnabled,
          fileUploadEnabled: settingsDraft.fileUploadEnabled,
          fileImportEnabled: settingsDraft.fileImportEnabled,
          microphoneEnabled: settingsDraft.microphoneEnabled,
        }),
      });
      const data = (await res.json()) as {
        settings?: AppSettings;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("admin.settings.couldNotSave"));
        return;
      }
      if (data.settings) {
        const s = data.settings;
        setSettings(s);
        setSettingsDraft({
          guestEnabled: s.guestEnabled,
          guestDailyLimit: String(s.guestDailyLimit),
          guestMaxMessageChars: String(s.guestMaxMessageChars),
          guestHistoryLimit: String(s.guestHistoryLimit),
          registrationEnabled: s.registrationEnabled,
          defaultModel: s.defaultModel,
          userMaxMessageChars: String(s.userMaxMessageChars),
          userHistoryLimit: String(s.userHistoryLimit),
          temperature: String(s.temperature),
          numPredict: String(s.numPredict),
          topP: String(s.topP),
          developerApiEnabled: s.developerApiEnabled === true,
          devLabEnabled: s.devLabEnabled === true,
          fileUploadEnabled: s.fileUploadEnabled === true,
          fileImportEnabled: s.fileImportEnabled === true,
          microphoneEnabled: s.microphoneEnabled === true,
        });
      }
      setNotice(t("admin.settings.saved"));
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--admin-fg)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(37,99,235,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 10%, rgba(14,165,233,0.1), transparent 50%)",
        }}
      />

      <PageHeader
        backLabel={t("admin.chrome.backToChat")}
        icon={Shield}
        title={t("admin.chrome.title")}
        subtitle={`${admin.username} · ${t("common.brand")}`}
        links={[
          { href: "/lab", label: t("chat.modelLab"), icon: FlaskConical },
          ...(settings?.devLabEnabled
            ? [{ href: "/devlab", label: t("chat.devLab"), icon: KeyRound }]
            : []),
        ]}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--chip-info-bg)] px-2.5 py-2 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--hover)] sm:px-3"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{t("admin.chrome.refresh")}</span>
          </button>
        }
      />

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 py-6">
        <nav className="flex gap-0.5 overflow-x-auto rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 [-webkit-overflow-scrolling:touch]">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex shrink-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition sm:flex-none ${
                  active
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--admin-muted)] hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
                {id === "users" ? (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-white/20"
                        : "bg-[var(--chip-info-bg)] text-[var(--admin-muted)]"
                    }`}
                  >
                    {users.length}
                  </span>
                ) : null}
                {id === "models" ? (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                      active
                        ? "bg-white/20"
                        : "bg-[var(--chip-info-bg)] text-[var(--admin-muted)]"
                    }`}
                  >
                    {enabledModels}/{models.length}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {error ? (
          <p className="rounded-2xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-4 py-2.5 text-sm text-[var(--status-bad-fg)]">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-2xl border border-[var(--status-ok-border)] bg-[var(--status-ok-bg)] px-4 py-2.5 text-sm text-[var(--status-ok-fg)]">
            {notice}
          </p>
        ) : null}

        {tab === "overview" ? (
          <div className="space-y-5 animate-fade-up">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {(pulse?.backends?.length
                ? pulse.backends
                : pulse
                  ? [
                      {
                        backend: "ollama" as const,
                        ok: pulse.ollama.ok,
                        latencyMs: pulse.ollama.latencyMs,
                        error: pulse.ollama.error,
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
                  {b.ok ? t("admin.chrome.online") : t("admin.chrome.down")}
                  {` · ${fmtMs(b.latencyMs)}`}
                </span>
              ))}
              <span className="status-pill status-info">
                <Radio
                  size={12}
                  className={pulse?.liveCount ? "animate-pulse" : ""}
                />
                {t("admin.overview.liveCount", { n: pulse?.liveCount ?? 0 })}
              </span>
              <span
                className={`status-pill ${
                  meta?.guardrailsOn ? "status-ok" : "status-warn"
                }`}
              >
                <ShieldAlert size={12} />
                {meta?.guardrailsOn
                  ? t("admin.overview.guardrailsOn")
                  : t("admin.overview.guardrailsOff")}
                {meta
                  ? t("admin.overview.hardRules", { n: meta.keywordRules })
                  : ""}
              </span>
              <span
                className={`status-pill ${
                  meta?.knowledgeOn ? "status-ok" : "status-info"
                }`}
              >
                <BookOpen size={12} />
                {meta?.knowledgeOn
                  ? t("admin.overview.knowledgeOn")
                  : t("admin.overview.knowledgeOff")}
                {meta
                  ? t("admin.overview.docsRatio", {
                      enabled: meta.knowledgeEnabled,
                      total: meta.knowledgeDocs,
                    })
                  : ""}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: t("admin.overview.requestsToday"),
                  value: fmtNum(pulse?.summary.requests_today),
                  hint: t("admin.usage.last24h", {
                    n: fmtNum(pulse?.summary.requests_24h),
                  }),
                  icon: Activity,
                },
                {
                  label: t("admin.overview.avgFirstToken"),
                  value: fmtMs(pulse?.summary.avg_ttft_ms),
                  hint: t("admin.overview.avgReply", {
                    value: fmtMs(pulse?.summary.avg_duration_ms),
                  }),
                  icon: Zap,
                },
                {
                  label: t("admin.overview.avgSpeed"),
                  value:
                    pulse?.summary.avg_tokens_per_sec != null
                      ? t("admin.overview.tokPerSec", {
                          n: pulse.summary.avg_tokens_per_sec,
                        })
                      : "—",
                  hint: t("admin.overview.requests7d", {
                    n: fmtNum(pulse?.summary.requests_7d),
                  }),
                  icon: Gauge,
                },
                {
                  label: t("admin.overview.errorRate"),
                  value: errorRate != null ? `${errorRate}%` : "—",
                  hint: t("admin.overview.errorsAllTime", {
                    n: fmtNum(pulse?.summary.error_requests),
                  }),
                  icon: Timer,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="admin-card rounded-2xl px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--admin-muted)]">
                      {card.label}
                    </p>
                    <card.icon size={14} className="text-[var(--accent)]" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--admin-fg)]">
                    {card.value}
                  </p>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">
                    {card.hint}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: t("admin.overview.users"),
                  value: totals?.total_users ?? "—",
                  hint: t("admin.overview.activeIn7d", { n: activeLast7d }),
                },
                {
                  label: t("admin.overview.accountsOn"),
                  value: totals?.active_users ?? "—",
                  hint: t("admin.overview.accountsHint", {
                    disabled: disabledUsers,
                    admin: adminUsers,
                  }),
                },
                {
                  label: t("admin.overview.chats"),
                  value: totals?.total_conversations ?? "—",
                  hint: t("admin.overview.savedConversations"),
                },
                {
                  label: t("admin.overview.messages"),
                  value: totals?.total_messages ?? "—",
                  hint: t("admin.overview.userPrompts", {
                    n: totals?.total_user_messages ?? "—",
                  }),
                },
                {
                  label: t("admin.overview.guestUserAi"),
                  value: `${fmtNum(pulse?.summary.guest_requests)} / ${fmtNum(pulse?.summary.user_requests)}`,
                  hint: t("admin.overview.allTimeSplit"),
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="admin-card rounded-2xl px-4 py-3"
                >
                  <p className="text-xs font-medium text-[var(--admin-muted)]">
                    {card.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-[var(--admin-fg)]">
                    {isLoading ? "…" : card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--admin-muted)]">
                    {card.hint}
                  </p>
                </div>
              ))}
            </div>

            <section className="admin-card rounded-2xl p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--admin-fg)]">
                    {t("admin.overview.last24h")}
                  </h2>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {t("admin.overview.requestsPerHour")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("usage")}
                  className="text-xs font-medium text-[var(--accent)] transition hover:opacity-80"
                >
                  {t("admin.overview.openLiveUsage")}
                </button>
              </div>
              {pulse?.byHour.length ? (
                <div className="flex h-28 items-end gap-1">
                  {pulse.byHour.map((bucket) => {
                    const heightPx = Math.max(
                      6,
                      Math.round((bucket.requests / maxHourRequests) * 96),
                    );
                    const label = bucket.hour.slice(-5);
                    return (
                      <div
                        key={bucket.hour}
                        className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
                        title={t("admin.overview.hourRequests", {
                          hour: bucket.hour,
                          n: bucket.requests,
                        })}
                      >
                        <div
                          className="w-full rounded-t-sm bg-gradient-to-t from-blue-600/80 to-sky-400/80 transition group-hover:from-blue-500 group-hover:to-sky-300"
                          style={{ height: `${heightPx}px` }}
                        />
                        <span className="mt-1 hidden text-[9px] text-[var(--admin-muted)] sm:block">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.noUsage24h")}
                </p>
              )}
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4">
                <h2 className="text-sm font-semibold">{t("admin.overview.topModels")}</h2>
                <p className="mb-3 text-xs text-[var(--admin-muted)]">
                  {t("admin.overview.volumeSpeed")}
                </p>
                {pulse?.byModel.length ? (
                  <ul className="space-y-2">
                    {pulse.byModel.map((row) => (
                      <li
                        key={row.model}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate text-[var(--admin-fg)]">
                          {row.model}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--admin-muted)]">
                          {t("admin.overview.reqs", { n: row.requests })}
                          {row.avg_tokens_per_sec != null
                            ? ` · ${t("admin.overview.tokPerSec", { n: row.avg_tokens_per_sec })}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--admin-muted)]">{t("admin.overview.noModelUsage")}</p>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4">
                <h2 className="text-sm font-semibold">{t("admin.overview.topChatters")}</h2>
                <p className="mb-3 text-xs text-[var(--admin-muted)]">
                  {t("admin.overview.mostActive")}
                </p>
                {pulse?.topUsers.length ? (
                  <ul className="space-y-2">
                    {pulse.topUsers.map((row) => (
                      <li
                        key={`${row.source}-${row.username}`}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate">
                          <span className="text-[var(--admin-fg)]">{row.username}</span>
                          <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                            {row.source}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-[var(--admin-muted)]">
                          {t("admin.overview.reqs", { n: row.requests })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--admin-muted)]">{t("admin.overview.noChatters")}</p>
                )}
              </section>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => setTab("usage")}
                className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--hover)]"
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.aiPerformance")}</p>
                <p className="mt-1 text-xl font-semibold">{t("admin.overview.liveUsage")}</p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.speedLoadHistory")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("models")}
                className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--hover)]"
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.models")}</p>
                <p className="mt-1 text-xl font-semibold">
                  {t("admin.overview.enabledCount", { enabled: enabledModels })}
                </p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.toggleWhichModels")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("knowledge")}
                className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--hover)]"
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.companyKnowledge")}</p>
                <p className="mt-1 text-xl font-semibold">
                  {t("admin.overview.docsCount", {
                    n: meta?.knowledgeEnabled ?? "—",
                  })}
                </p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.retrievalCitations")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("settings")}
                className="rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 p-4 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--hover)]"
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.accessSettings")}</p>
                <p className="mt-1 text-xl font-semibold">
                  {settings?.guestEnabled === false
                    ? t("admin.overview.guestOff")
                    : `${t("admin.overview.guestOn")} ${t("admin.overview.perDay", { n: settings?.guestDailyLimit ?? "—" })}`}
                </p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {settings?.registrationEnabled === false
                    ? t("admin.overview.registrationClosed")
                    : t("admin.overview.registrationOpen")}{" "}
                  · temp {settings?.temperature ?? "—"} · top-p{" "}
                  {settings?.topP ?? "—"}
                  {settings?.numPredict != null && settings.numPredict >= 0
                    ? ` · max ${settings.numPredict} tok`
                    : ""}
                </p>
              </button>
            </div>
          </div>
        ) : null}

        {tab === "usage" ? <AdminUsagePanel /> : null}

        {tab === "knowledge" ? (
          <AdminKnowledgePanel
            onNotice={(message) => {
              setError("");
              setNotice(message);
            }}
            onError={(message) => {
              setNotice("");
              setError(message);
            }}
          />
        ) : null}

        {tab === "guardrails" ? (
          <AdminGuardrailsPanel
            onNotice={(message) => {
              setError("");
              setNotice(message);
            }}
            onError={(message) => {
              setNotice("");
              setError(message);
            }}
          />
        ) : null}

        {tab === "users" ? (
          <section className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 backdrop-blur-md">
            <div className="flex flex-col gap-3 border-b border-[var(--admin-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">{t("admin.users.allUsers")}</h2>
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("admin.users.subtitle")}
                  {filteredUsers.length
                    ? t("admin.users.showing", {
                        start: userRangeStart,
                        end: userRangeEnd,
                        total: filteredUsers.length,
                      })
                    : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
                  />
                  <input
                    value={userQuery}
                    onChange={(e) => changeUserQuery(e.target.value)}
                    placeholder={t("admin.users.searchUsername")}
                    className="w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)]/80 py-2 pl-8 pr-3 text-sm outline-none placeholder:text-[var(--admin-muted)]/30 focus:border-[var(--accent)]/50 sm:w-48"
                  />
                </div>
                <select
                  value={userFilter}
                  onChange={(e) =>
                    changeUserFilter(
                      e.target.value as "all" | "active" | "disabled" | "admin",
                    )
                  }
                  className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)]/80 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="all">{t("admin.users.all")}</option>
                  <option value="active">{t("admin.users.active")}</option>
                  <option value="disabled">{t("admin.users.disabled")}</option>
                  <option value="admin">{t("admin.users.admins")}</option>
                </select>
                <label className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
                  {t("admin.chrome.rows")}
                  <select
                    value={userPageSize}
                    onChange={(e) =>
                      changeUserPageSize(
                        Number(e.target.value) as (typeof USER_PAGE_SIZE_OPTIONS)[number],
                      )
                    }
                    className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-input)]/80 px-2 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
                  >
                    {USER_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("admin.users.colUser")}</th>
                    <th>{t("admin.users.colRole")}</th>
                    <th>{t("admin.users.colStatus")}</th>
                    <th>{t("admin.users.colRegistered")}</th>
                    <th>{t("admin.users.colLastActive")}</th>
                    <th>{t("admin.users.colChats")}</th>
                    <th>{t("admin.users.colMsgs")}</th>
                    <th>{t("admin.users.colPrompts")}</th>
                    <th>{t("admin.users.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-[var(--admin-muted)]"
                      >
                        {t("admin.chrome.loading")}
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-[var(--admin-muted)]"
                      >
                        {t("admin.users.noMatch")}
                      </td>
                    </tr>
                  ) : (
                    pagedUsers.map((user) => {
                      const isSelf = user.id === admin.id;
                      const isBusy = busyId === user.id;
                      return (
                        <tr
                          key={user.id}
                          className="border-t border-[var(--admin-border)]"
                        >
                          <td className="px-4 py-3 font-medium">
                            {user.username}
                            {isSelf ? (
                              <span className="ml-2 text-xs text-[var(--admin-muted)]">
                                {t("admin.users.you")}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`status-pill ${
                                user.role === "admin"
                                  ? "status-info"
                                  : "status-neutral"
                              }`}
                            >
                              {user.role === "admin"
                                ? t("admin.users.roleAdmin")
                                : t("admin.users.roleUser")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`status-pill ${
                                user.is_active === 1 ? "status-ok" : "status-bad"
                              }`}
                            >
                              {user.is_active === 1
                                ? t("admin.users.statusActive")
                                : t("admin.users.statusDisabled")}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--admin-muted)]">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[var(--admin-muted)]">
                            {formatDate(user.last_active_at)}
                          </td>
                          <td className="px-4 py-3">{user.conversation_count}</td>
                          <td className="px-4 py-3">{user.message_count}</td>
                          <td className="px-4 py-3">{user.user_message_count}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleToggleActive(user)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--admin-fg)] hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {user.is_active === 1 ? (
                                  <>
                                    <UserX size={14} /> {t("admin.chrome.disable")}
                                  </>
                                ) : (
                                  <>
                                    <UserCheck size={14} /> {t("admin.chrome.enable")}
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleDelete(user)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--status-bad-fg)] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                                {t("admin.chrome.delete")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
              <p className="text-xs text-[var(--admin-muted)]">
                {t("admin.users.pageOf", {
                  page: safeUserPage,
                  total: userTotalPages,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeUserPage <= 1}
                  onClick={() => setUserPage(safeUserPage - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--chip-info-bg)] px-3 py-1.5 text-xs text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  {t("admin.chrome.prev")}
                </button>
                <button
                  type="button"
                  disabled={safeUserPage >= userTotalPages}
                  onClick={() => setUserPage(safeUserPage + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--chip-info-bg)] px-3 py-1.5 text-xs text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("admin.chrome.next")}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "models" ? (
          <section className="animate-fade-up overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)]/90 backdrop-blur-md">
            <div className="border-b border-[var(--admin-border)] px-4 py-3">
              <h2 className="text-sm font-semibold">{t("admin.models.title")}</h2>
              <p className="text-xs text-[var(--admin-muted)]">
                {t("admin.models.subtitle")}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--admin-muted)]">
                {t("admin.models.capsLegend")}
              </p>
            </div>

            {isLoading ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
                {t("admin.chrome.loading")}
              </p>
            ) : models.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
                {t("admin.models.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("admin.models.colId")}</th>
                      <th>{t("admin.models.colCaps")}</th>
                      <th>{t("admin.models.colSize")}</th>
                      <th className="min-w-[220px]">{t("admin.models.colDisplay")}</th>
                      <th>{t("admin.models.colStatus")}</th>
                      <th>{t("admin.models.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedModels.map((model) => {
                      const busy = busyModel === model.name;
                      const draft =
                        displayDrafts[model.name] ?? model.display_name;
                      const dirty =
                        draft.trim() !==
                        (model.display_name || model.name).trim();
                      return (
                        <tr
                          key={model.name}
                          className={`border-t border-[var(--admin-border)] ${
                            model.is_enabled ? "" : "bg-[var(--accent)]/[0.04]"
                          }`}
                        >
                          <td className="px-4 py-2.5">
                            <p className="max-w-[180px] truncate font-mono text-xs text-[var(--admin-fg)]">
                              {model.name}
                            </p>
                            {model.modified_at ? (
                              <p className="mt-0.5 text-[11px] text-[var(--admin-muted)]">
                                {formatDate(model.modified_at)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <ModelCapabilityBadges
                                showText
                                vision={model.vision}
                                audio={model.audio}
                                video={model.video}
                                tools={model.tools}
                              />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--admin-muted)]">
                            {formatSize(model.size)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                value={draft}
                                onChange={(e) =>
                                  setDisplayDrafts((prev) => ({
                                    ...prev,
                                    [model.name]: e.target.value,
                                  }))
                                }
                                placeholder={model.name}
                                maxLength={120}
                                className="w-full max-w-[220px] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)]/80 px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--admin-muted)]/30 focus:border-[var(--accent)]/50"
                              />
                              <button
                                type="button"
                                disabled={busy || !dirty}
                                onClick={() =>
                                  void handleSaveDisplayName(model)
                                }
                                className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busy && dirty ? "…" : t("admin.chrome.save")}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`status-pill ${
                                model.is_enabled ? "status-ok" : "status-bad"
                              }`}
                            >
                              {model.is_enabled
                                ? t("admin.models.enabled")
                                : t("admin.models.disabled")}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleToggleModel(model)}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                                model.is_enabled
                                  ? "border border-[var(--admin-border)] text-[var(--admin-fg)] hover:bg-[var(--hover)]"
                                  : "bg-gradient-to-r from-blue-600 to-sky-500 text-white"
                              }`}
                            >
                              {busy && !dirty
                                ? "…"
                                : model.is_enabled
                                  ? t("admin.models.deactivate")
                                  : t("admin.models.activate")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {tab === "settings" ? (
          <AdminSettingsPanel
            draft={settingsDraft}
            onChange={setSettingsDraft}
            models={models}
            savedDefaultModel={settings?.defaultModel}
            isSaving={savingSettings}
            onSave={() => void handleSaveSettings()}
          />
        ) : null}
      </main>
    </div>
  );
};
