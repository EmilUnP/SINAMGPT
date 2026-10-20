"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Bot,
  FlaskConical,
  KeyRound,
  Gauge,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Server,
  Settings2,
  Shield,
  ShieldAlert,
  Timer,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
  Zap,
} from "lucide-react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPager,
  AdminPanelCard,
  AdminRowsSelect,
  AdminSearchInput,
  AdminStatCard,
  AdminStatGrid,
  AdminToasts,
  adminBtnPrimary,
  adminBtnRow,
  adminBtnRowDanger,
  adminControlClass,
} from "./AdminChrome";
import { AdminGuardrailsPanel } from "./AdminGuardrailsPanel";
import { AdminKnowledgePanel } from "./AdminKnowledgePanel";
import { AdminProvidersPanel } from "./AdminProvidersPanel";
import { AdminSettingsPanel, type SettingsDraft } from "./AdminSettingsPanel";
import { AdminUsagePanel } from "./AdminUsagePanel";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/chat/CopyButton";
import { useConfirm } from "@/components/ConfirmDialog";
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
  backend: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
  baseUrl?: string;
};

type OverviewPulse = {
  liveCount: number;
  llm: { ok: boolean; latencyMs: number; error?: string; backend?: string };
  backends: BackendPulse[];
  summary: {
    total_requests: number | null;
    ok_requests: number | null;
    error_requests: number | null;
    guest_requests: number | null;
    user_requests: number | null;
    api_requests: number | null;
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
    source: "user" | "guest" | "api";
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
  backend?: string;
  kind: "chat" | "image" | "video" | "stt" | "tts" | "embedding" | "rerank";
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  tts?: boolean;
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
  webSearchEnabled: boolean;
  webSearchEngine: "duckduckgo" | "searxng";
  webSearchSearxngUrl: string;
  webSearchMaxResults: number;
  webSearchDenyHosts: string;
  webSearchDailyQuota: number;
  webSearchDefaultLocation: string;
};

type TabId =
  | "overview"
  | "usage"
  | "users"
  | "models"
  | "providers"
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

const USER_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const MODEL_KIND_OPTIONS: Array<ManagedModel["kind"]> = [
  "chat",
  "image",
  "video",
  "stt",
  "tts",
  "embedding",
  "rerank",
];

const EMPTY_DRAFT: SettingsDraft = {
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
  webSearchEnabled: false,
  webSearchEngine: "duckduckgo",
  webSearchSearxngUrl: "",
  webSearchMaxResults: "5",
  webSearchDenyHosts: "",
  webSearchDailyQuota: "30",
  webSearchDefaultLocation: "",
};

/** Saved settings → editable form strings (one mapping for load and save). */
const toDraft = (s: AppSettings): SettingsDraft => ({
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
  webSearchEnabled: s.webSearchEnabled === true,
  webSearchEngine: s.webSearchEngine === "searxng" ? "searxng" : "duckduckgo",
  webSearchSearxngUrl: s.webSearchSearxngUrl ?? "",
  webSearchMaxResults: String(s.webSearchMaxResults ?? 5),
  webSearchDenyHosts: s.webSearchDenyHosts ?? "",
  webSearchDailyQuota: String(s.webSearchDailyQuota ?? 30),
  webSearchDefaultLocation: s.webSearchDefaultLocation ?? "",
});

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
  const confirm = useConfirm();
  const fmtMs = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    if (value < 1000) return t("common.ms", { n: Math.round(value) });
    return t("common.sec", { n: (value / 1000).toFixed(1) });
  };
  const fmtNum = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "—";
    return value.toLocaleString(LOCALE_BCP47[locale]);
  };
  const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> =
    [
      { id: "overview", label: t("admin.tabs.overview"), icon: LayoutDashboard },
      { id: "usage", label: t("admin.tabs.usage"), icon: Activity },
      { id: "users", label: t("admin.tabs.users"), icon: Users },
      { id: "models", label: t("admin.tabs.models"), icon: Bot },
      { id: "providers", label: t("admin.tabs.providers"), icon: Server },
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
  const formatDay = (value: string | null) => {
    if (!value) return "—";
    const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(LOCALE_BCP47[locale]);
  };

  const [tab, setTab] = useState<TabId>("overview");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pulse, setPulse] = useState<OverviewPulse | null>(null);
  const [meta, setMeta] = useState<OverviewMeta | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(EMPTY_DRAFT);
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
  const [resetLink, setResetLink] = useState<{ username: string; url: string } | null>(null);
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
          fetch("/api/admin/usage?overview=1", { cache: "no-store" }),
          fetch("/api/admin/knowledge?overview=1"),
          fetch("/api/admin/guardrails?events=0"),
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
        llm?: OverviewPulse["llm"];
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
        overview?: { total: number; enabled: number };
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
        setSettings(settingsData.settings);
        setSettingsDraft(toDraft(settingsData.settings));
      }

      if (usageRes.ok && usageData.analytics?.summary && usageData.llm) {
        setPulse({
          liveCount: usageData.live?.length ?? 0,
          llm: usageData.llm,
          backends: usageData.backends ?? [
            {
              backend: "vllm",
              ok: usageData.llm.ok,
              latencyMs: usageData.llm.latencyMs,
              error: usageData.llm.error,
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
          knowledgeDocs: knowledgeData.overview?.total ?? docs.length,
          knowledgeEnabled:
            knowledgeData.overview?.enabled ??
            docs.filter((d) => d.is_enabled === 1).length,
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

  /*
   * A row action only changes users and their totals. Reloading just that
   * list keeps the table in place instead of flashing "Loading…" and
   * re-syncing every provider's model catalog.
   */
  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = (await res.json()) as {
      users?: AdminUserRow[];
      totals?: Totals;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || t("admin.users.failedLoad"));
      return;
    }
    setUsers(data.users ?? []);
    setTotals(data.totals ?? null);
  }, [t]);

  const dismissNotice = useCallback(() => setNotice(""), []);
  const dismissError = useCallback(() => setError(""), []);
  const showNotice = useCallback((message: string) => {
    setError("");
    setNotice(message);
  }, []);
  const showError = useCallback((message: string) => {
    setNotice("");
    setError(message);
  }, []);

  const settingsDirty = useMemo(
    () =>
      settings !== null &&
      JSON.stringify(settingsDraft) !== JSON.stringify(toDraft(settings)),
    [settings, settingsDraft],
  );

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
      await loadUsers();
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (user: AdminUserRow) => {
    setBusyId(user.id);
    setError("");
    setResetLink(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username }),
      });
      const data = await res.json() as { resetUrl?: string; error?: string };
      if (!res.ok || !data.resetUrl) throw new Error(data.error || t("auth.forgotSendFailed"));
      setResetLink({ username: user.username, url: data.resetUrl });
    } catch (error) {
      setError(error instanceof Error ? error.message : t("admin.chrome.networkError"));
    } finally { setBusyId(null); }
  };

  const handleDelete = async (user: AdminUserRow) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("admin.users.deleteConfirm", { name: user.username }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;

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
      await loadUsers();
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
          ? t("admin.models.renamed", { name: model.name, label: next })
          : t("admin.models.resetToId", { name: model.name }),
      );
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setBusyModel(null);
    }
  };

  const handleModelKindChange = async (
    model: ManagedModel,
    kind: ManagedModel["kind"],
  ) => {
    setBusyModel(model.name);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/models", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: model.name, kind }),
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
      setNotice(`${model.name}: ${kind}`);
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
    const webSearchMaxResults = Number(settingsDraft.webSearchMaxResults);
    const webSearchDailyQuota = Number(settingsDraft.webSearchDailyQuota);
    if (
      !Number.isFinite(webSearchMaxResults) ||
      webSearchMaxResults < 1 ||
      webSearchMaxResults > 10
    ) {
      setError(t("admin.settings.errWebSearchResults"));
      return;
    }
    if (
      !Number.isFinite(webSearchDailyQuota) ||
      webSearchDailyQuota < 0 ||
      webSearchDailyQuota > 500
    ) {
      setError(t("admin.settings.errWebSearchQuota"));
      return;
    }
    if (
      settingsDraft.webSearchEngine === "searxng" &&
      !settingsDraft.webSearchSearxngUrl.trim()
    ) {
      setError(t("admin.settings.errWebSearchSearxng"));
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
          webSearchEnabled: settingsDraft.webSearchEnabled,
          webSearchEngine: settingsDraft.webSearchEngine,
          webSearchSearxngUrl: settingsDraft.webSearchSearxngUrl.trim(),
          webSearchMaxResults: Math.floor(webSearchMaxResults),
          webSearchDenyHosts: settingsDraft.webSearchDenyHosts,
          webSearchDailyQuota: Math.floor(webSearchDailyQuota),
          webSearchDefaultLocation: settingsDraft.webSearchDefaultLocation.trim(),
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
        setSettingsDraft(toDraft(s));
      }
      setNotice(t("admin.settings.saved"));
    } catch {
      setError(t("admin.chrome.networkError"));
    } finally {
      setSavingSettings(false);
    }
  };

  // Status pills wait for data so a slow load never claims "off".
  const backendPills = pulse
    ? pulse.backends?.length
      ? pulse.backends
      : [
          {
            backend: "vllm",
            ok: pulse.llm.ok,
            latencyMs: pulse.llm.latencyMs,
            error: pulse.llm.error,
          },
        ]
    : [];
  const booting = isLoading && settings === null;
  const statValue = (value: string) => (booting ? "…" : value);
  const quickLinkClass =
    "min-w-0 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--hover)]";

  return (
    <div className="admin-shell min-h-dvh bg-[var(--bg)] text-[var(--admin-fg)]">
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
            disabled={isLoading}
            aria-label={t("admin.chrome.refresh")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--chip-info-bg)] px-2.5 py-2 text-sm font-medium text-[var(--admin-fg)] transition hover:bg-[var(--hover)] disabled:cursor-progress sm:min-h-0 sm:min-w-0 sm:px-3"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{t("admin.chrome.refresh")}</span>
          </button>
        }
      />

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:pt-6">
        <nav
          aria-label={t("admin.chrome.sections")}
          className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1"
        >
          <div role="tablist" className="grid grid-cols-4 gap-1 lg:grid-cols-8">
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              const badge =
                id === "users"
                  ? String(users.length)
                  : id === "models"
                    ? `${enabledModels}/${models.length}`
                    : null;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-[11px] font-medium leading-tight transition sm:min-h-10 sm:flex-row sm:gap-1.5 sm:px-2 sm:text-[13px] ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--admin-muted)] hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="min-w-0 break-words">{label}</span>
                  {badge !== null ? (
                    <span
                      className={`hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums sm:inline ${
                        active
                          ? "bg-white/20"
                          : "bg-[var(--chip-info-bg)] text-[var(--admin-muted)]"
                      }`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <AdminToasts
          notice={notice}
          error={error}
          onDismissNotice={dismissNotice}
          onDismissError={dismissError}
        />

        {tab === "overview" ? (
          <div className="space-y-5 animate-fade-up">
            {pulse || meta ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {backendPills.map((b) => (
                  <span
                    key={b.backend}
                    title={b.error}
                    className={`status-pill ${b.ok ? "status-ok" : "status-bad"}`}
                  >
                    <Server size={12} />
                    {b.backend === "vllm" ? "vLLM" : b.backend}{" "}
                    {b.ok ? t("admin.chrome.online") : t("admin.chrome.down")}
                    {` · ${fmtMs(b.latencyMs)}`}
                  </span>
                ))}
                {pulse ? (
                  <span className="status-pill status-info">
                    <Radio
                      size={12}
                      className={pulse.liveCount ? "animate-pulse" : ""}
                    />
                    {t("admin.overview.liveCount", { n: pulse.liveCount })}
                  </span>
                ) : null}
                {meta ? (
                  <>
                    <span
                      className={`status-pill ${
                        meta.guardrailsOn ? "status-ok" : "status-warn"
                      }`}
                    >
                      <ShieldAlert size={12} />
                      {meta.guardrailsOn
                        ? t("admin.overview.guardrailsOn")
                        : t("admin.overview.guardrailsOff")}
                      {t("admin.overview.hardRules", { n: meta.keywordRules })}
                    </span>
                    <span
                      className={`status-pill ${
                        meta.knowledgeOn ? "status-ok" : "status-info"
                      }`}
                    >
                      <BookOpen size={12} />
                      {meta.knowledgeOn
                        ? t("admin.overview.knowledgeOn")
                        : t("admin.overview.knowledgeOff")}
                      {t("admin.overview.docsRatio", {
                        enabled: meta.knowledgeEnabled,
                        total: meta.knowledgeDocs,
                      })}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}

            <AdminStatGrid>
              <AdminStatCard
                icon={Activity}
                label={t("admin.overview.requestsToday")}
                value={statValue(fmtNum(pulse?.summary.requests_today))}
                hint={t("admin.usage.last24h", {
                  n: fmtNum(pulse?.summary.requests_24h),
                })}
              />
              <AdminStatCard
                icon={Zap}
                label={t("admin.overview.avgFirstToken")}
                value={statValue(fmtMs(pulse?.summary.avg_ttft_ms))}
                hint={t("admin.overview.avgReply", {
                  value: fmtMs(pulse?.summary.avg_duration_ms),
                })}
              />
              <AdminStatCard
                icon={Gauge}
                label={t("admin.overview.avgSpeed")}
                value={statValue(
                  pulse?.summary.avg_tokens_per_sec != null
                    ? t("admin.overview.tokPerSec", {
                        n: pulse.summary.avg_tokens_per_sec,
                      })
                    : "—",
                )}
                hint={t("admin.overview.requests7d", {
                  n: fmtNum(pulse?.summary.requests_7d),
                })}
              />
              <AdminStatCard
                icon={Timer}
                label={t("admin.overview.errorRate")}
                value={statValue(errorRate != null ? `${errorRate}%` : "—")}
                hint={t("admin.overview.errorsAllTime", {
                  n: fmtNum(pulse?.summary.error_requests),
                })}
                tone={errorRate ? "bad" : "default"}
              />
            </AdminStatGrid>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
              {[
                {
                  label: t("admin.overview.users"),
                  value: fmtNum(totals?.total_users),
                  hint: t("admin.overview.activeIn7d", { n: activeLast7d }),
                },
                {
                  label: t("admin.overview.accountsOn"),
                  value: fmtNum(totals?.active_users),
                  hint: t("admin.overview.accountsHint", {
                    disabled: disabledUsers,
                    admin: adminUsers,
                  }),
                },
                {
                  label: t("admin.overview.chats"),
                  value: fmtNum(totals?.total_conversations),
                  hint: t("admin.overview.savedConversations"),
                },
                {
                  label: t("admin.overview.messages"),
                  value: fmtNum(totals?.total_messages),
                  hint: t("admin.overview.userPrompts", {
                    n: fmtNum(totals?.total_user_messages),
                  }),
                },
                {
                  label: t("admin.overview.guestUserAi"),
                  value: `${fmtNum(pulse?.summary.guest_requests)} / ${fmtNum(pulse?.summary.user_requests)}`,
                  hint: t("admin.overview.allTimeSplit"),
                },
              ].map((card) => (
                <AdminStatCard
                  key={card.label}
                  label={card.label}
                  value={statValue(card.value)}
                  hint={card.hint}
                />
              ))}
            </div>

            <AdminPanelCard className="p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                    {t("admin.overview.last24h")}
                  </h3>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {t("admin.overview.requestsPerHour")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("usage")}
                  className="touch-target rounded text-xs font-medium text-[var(--accent)] transition hover:opacity-80"
                >
                  {t("admin.overview.openLiveUsage")}
                </button>
              </div>
              {pulse?.byHour.length ? (
                <div className="flex h-28 items-end gap-0.5 sm:gap-1">
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
                          className="admin-bar w-full rounded-t-sm transition group-hover:opacity-80"
                          style={{ height: `${heightPx}px` }}
                        />
                        <span className="mt-1 hidden text-[9px] text-[var(--admin-muted)] lg:block">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <AdminEmptyState className="py-8">
                  {booting
                    ? t("admin.chrome.loading")
                    : t("admin.overview.noUsage24h")}
                </AdminEmptyState>
              )}
            </AdminPanelCard>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AdminPanelCard className="p-4">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.overview.topModels")}
                </h3>
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
                        <span className="min-w-0 truncate text-[var(--admin-fg)]">
                          {row.model}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-[var(--admin-muted)]">
                          {t("admin.overview.reqs", { n: row.requests })}
                          {row.avg_tokens_per_sec != null
                            ? ` · ${t("admin.overview.tokPerSec", { n: row.avg_tokens_per_sec })}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--admin-muted)]">
                    {booting
                      ? t("admin.chrome.loading")
                      : t("admin.overview.noModelUsage")}
                  </p>
                )}
              </AdminPanelCard>

              <AdminPanelCard className="p-4">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.overview.topChatters")}
                </h3>
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
                        <span className="min-w-0 truncate">
                          <span className="text-[var(--admin-fg)]">{row.username}</span>
                          <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                            {row.source}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-[var(--admin-muted)]">
                          {t("admin.overview.reqs", { n: row.requests })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--admin-muted)]">
                    {booting
                      ? t("admin.chrome.loading")
                      : t("admin.overview.noChatters")}
                  </p>
                )}
              </AdminPanelCard>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => setTab("usage")}
                className={quickLinkClass}
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.aiPerformance")}</p>
                <p className="mt-1 text-lg font-semibold">{t("admin.overview.liveUsage")}</p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.speedLoadHistory")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("models")}
                className={quickLinkClass}
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.models")}</p>
                <p className="mt-1 text-lg font-semibold">
                  {t("admin.overview.enabledCount", { enabled: enabledModels })}
                </p>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {t("admin.overview.toggleWhichModels")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("knowledge")}
                className={quickLinkClass}
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.companyKnowledge")}</p>
                <p className="mt-1 text-lg font-semibold">
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
                className={quickLinkClass}
              >
                <p className="text-xs text-[var(--admin-muted)]">{t("admin.overview.accessSettings")}</p>
                <p className="mt-1 text-lg font-semibold">
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

        {tab === "usage" ? (
          <AdminUsagePanel onNotice={showNotice} onError={showError} />
        ) : null}

        {tab === "knowledge" ? (
          <AdminKnowledgePanel onNotice={showNotice} onError={showError} />
        ) : null}

        {tab === "guardrails" ? (
          <AdminGuardrailsPanel onNotice={showNotice} onError={showError} />
        ) : null}

        {tab === "users" ? (
          <AdminPanelCard>
            <div className="space-y-4 px-4 py-4">
              <AdminPageHeader
                icon={Users}
                title={t("admin.users.allUsers")}
                description={`${t("admin.users.subtitle")}${
                  filteredUsers.length
                    ? t("admin.users.showing", {
                        start: userRangeStart,
                        end: userRangeEnd,
                        total: filteredUsers.length,
                      })
                    : ""
                }`}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <AdminSearchInput
                  value={userQuery}
                  onChange={changeUserQuery}
                  placeholder={t("admin.users.searchUsername")}
                  className="sm:w-64"
                />
                <select
                  value={userFilter}
                  aria-label={t("admin.users.colStatus")}
                  onChange={(e) =>
                    changeUserFilter(
                      e.target.value as "all" | "active" | "disabled" | "admin",
                    )
                  }
                  className={`${adminControlClass} w-full sm:w-auto`}
                >
                  <option value="all">{t("admin.users.all")}</option>
                  <option value="active">{t("admin.users.active")}</option>
                  <option value="disabled">{t("admin.users.disabled")}</option>
                  <option value="admin">{t("admin.users.admins")}</option>
                </select>
              </div>

              {resetLink ? (
                <div className="space-y-2 rounded-xl border border-[var(--status-info-border)] bg-[var(--status-info-bg)]/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--admin-fg)]">
                        {t("admin.users.resetPassword")} · {resetLink.username}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--admin-muted)]">
                        {t("admin.users.resetLinkHint")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResetLink(null)}
                      aria-label={t("admin.chrome.close")}
                      className="touch-target shrink-0 rounded-md p-1 text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={resetLink.url}
                      aria-label={t("admin.users.resetPassword")}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`${adminControlClass} flex-1 font-mono sm:text-xs`}
                    />
                    <CopyButton
                      text={resetLink.url}
                      className={`${adminBtnRow} shrink-0`}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto border-t border-[var(--admin-border)]">
              <table className="admin-table admin-table-stack">
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
                  {isLoading && users.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <AdminEmptyState>{t("admin.chrome.loading")}</AdminEmptyState>
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <AdminEmptyState>{t("admin.users.noMatch")}</AdminEmptyState>
                      </td>
                    </tr>
                  ) : (
                    pagedUsers.map((user) => {
                      const isSelf = user.id === admin.id;
                      const isBusy = busyId === user.id;
                      return (
                        <tr key={user.id} aria-busy={isBusy || undefined}>
                          <td className="admin-cell-primary">
                            <span className="font-medium [overflow-wrap:anywhere]">
                              {user.username}
                            </span>
                            {isSelf ? (
                              <span className="ml-2 text-xs text-[var(--admin-muted)]">
                                {t("admin.users.you")}
                              </span>
                            ) : null}
                          </td>
                          <td data-label={t("admin.users.colRole")}>
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
                          <td data-label={t("admin.users.colStatus")}>
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
                          <td
                            data-label={t("admin.users.colRegistered")}
                            className="whitespace-nowrap text-[var(--admin-muted)]"
                            title={formatDate(user.created_at)}
                          >
                            {formatDay(user.created_at)}
                          </td>
                          <td
                            data-label={t("admin.users.colLastActive")}
                            className="whitespace-nowrap text-[var(--admin-muted)]"
                          >
                            {formatDate(user.last_active_at)}
                          </td>
                          <td data-label={t("admin.users.colChats")} className="tabular-nums">
                            {fmtNum(user.conversation_count)}
                          </td>
                          <td data-label={t("admin.users.colMsgs")} className="tabular-nums">
                            {fmtNum(user.message_count)}
                          </td>
                          <td data-label={t("admin.users.colPrompts")} className="tabular-nums">
                            {fmtNum(user.user_message_count)}
                          </td>
                          <td className="admin-cell-actions">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleToggleActive(user)}
                                className={`${adminBtnRow} whitespace-nowrap`}
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
                              {/* Icon-only on desktop to keep the table within the page; the label stays for screen readers. */}
                              <button
                                type="button"
                                disabled={isBusy || user.is_active !== 1}
                                onClick={() => void handleResetPassword(user)}
                                title={t("admin.users.resetPassword")}
                                className={`${adminBtnRow} whitespace-nowrap lg:min-w-8`}
                              >
                                <KeyRound size={14} />
                                <span className="lg:sr-only">
                                  {t("admin.users.resetPassword")}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleDelete(user)}
                                title={t("admin.chrome.delete")}
                                className={`${adminBtnRowDanger} whitespace-nowrap lg:min-w-8`}
                              >
                                <Trash2 size={14} />
                                <span className="lg:sr-only">
                                  {t("admin.chrome.delete")}
                                </span>
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
            <AdminPager
              page={safeUserPage}
              totalPages={userTotalPages}
              onPage={setUserPage}
            >
              <AdminRowsSelect
                value={userPageSize}
                options={USER_PAGE_SIZE_OPTIONS}
                onChange={changeUserPageSize}
              />
            </AdminPager>
          </AdminPanelCard>
        ) : null}

        {tab === "models" ? (
          <AdminPanelCard>
            <div className="space-y-2 px-4 py-4">
              <AdminPageHeader
                icon={Bot}
                title={t("admin.models.title")}
                description={t("admin.models.subtitle")}
              />
              <p className="text-xs leading-relaxed text-[var(--admin-muted)]">
                {t("admin.models.capsLegend")}
              </p>
            </div>

            {isLoading && models.length === 0 ? (
              <AdminEmptyState className="border-t border-[var(--admin-border)]">
                {t("admin.chrome.loading")}
              </AdminEmptyState>
            ) : models.length === 0 ? (
              <AdminEmptyState className="border-t border-[var(--admin-border)]">
                {t("admin.models.empty")}
              </AdminEmptyState>
            ) : (
              <div className="overflow-x-auto border-t border-[var(--admin-border)]">
                <table className="admin-table admin-table-stack">
                  <thead>
                    <tr>
                      <th>{t("admin.models.colId")}</th>
                      <th>{t("admin.models.colTask")}</th>
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
                          aria-busy={busy || undefined}
                          className={
                            model.is_enabled ? "" : "bg-[var(--accent)]/[0.04]"
                          }
                        >
                          <td className="admin-cell-primary">
                            <p
                              className="font-mono text-xs text-[var(--admin-fg)] [overflow-wrap:anywhere] lg:max-w-[220px]"
                              title={model.name}
                            >
                              {model.name}
                            </p>
                            {model.modified_at ? (
                              <p className="mt-0.5 text-[11px] text-[var(--admin-muted)]">
                                {formatDate(model.modified_at)}
                              </p>
                            ) : null}
                          </td>
                          <td data-label={t("admin.models.colTask")}>
                            <select
                              value={model.kind}
                              disabled={busy}
                              aria-label={`${t("admin.models.colTask")}: ${model.name}`}
                              onChange={(event) =>
                                void handleModelKindChange(
                                  model,
                                  event.target.value as ManagedModel["kind"],
                                )
                              }
                              className={`${adminControlClass} w-auto pr-8`}
                            >
                              {MODEL_KIND_OPTIONS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {kind}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td data-label={t("admin.models.colCaps")}>
                            <div className="flex flex-wrap gap-1">
                              <ModelCapabilityBadges
                                showText
                                vision={model.vision}
                                audio={model.audio}
                                tts={model.tts}
                                video={model.video}
                                tools={model.tools}
                              />
                            </div>
                          </td>
                          <td
                            data-label={t("admin.models.colSize")}
                            className="whitespace-nowrap text-xs text-[var(--admin-muted)]"
                          >
                            {formatSize(model.size)}
                          </td>
                          <td
                            data-label={t("admin.models.colDisplay")}
                            className="admin-cell-block"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                value={draft}
                                onChange={(e) =>
                                  setDisplayDrafts((prev) => ({
                                    ...prev,
                                    [model.name]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && dirty && !busy) {
                                    e.preventDefault();
                                    void handleSaveDisplayName(model);
                                  }
                                }}
                                placeholder={model.name}
                                maxLength={120}
                                aria-label={`${t("admin.models.colDisplay")}: ${model.name}`}
                                className={`${adminControlClass} w-full lg:max-w-[220px]`}
                              />
                              <button
                                type="button"
                                disabled={busy || !dirty}
                                onClick={() =>
                                  void handleSaveDisplayName(model)
                                }
                                className={`${adminBtnPrimary} shrink-0 px-3 lg:min-h-8 lg:text-xs`}
                              >
                                {busy && dirty ? t("admin.chrome.saving") : t("admin.chrome.save")}
                              </button>
                            </div>
                          </td>
                          <td data-label={t("admin.models.colStatus")}>
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
                          <td className="admin-cell-actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleToggleModel(model)}
                              className={`${
                                model.is_enabled
                                  ? adminBtnRow
                                  : `${adminBtnPrimary} lg:min-h-8 lg:px-2.5 lg:text-xs`
                              } w-full whitespace-nowrap sm:w-auto`}
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
          </AdminPanelCard>
        ) : null}

        {tab === "providers" ? (
          <AdminProvidersPanel onNotice={showNotice} onError={showError} />
        ) : null}

        {tab === "settings" ? (
          <AdminSettingsPanel
            draft={settingsDraft}
            onChange={setSettingsDraft}
            models={models}
            savedDefaultModel={settings?.defaultModel}
            isSaving={savingSettings}
            isDirty={settingsDirty}
            onSave={() => void handleSaveSettings()}
          />
        ) : null}
      </main>
    </div>
  );
};
