"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
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
import sinamLogo from "@/assets/sinam_logo.png";
import { AdminGuardrailsPanel } from "@/components/AdminGuardrailsPanel";
import { AdminKnowledgePanel } from "@/components/AdminKnowledgePanel";
import { AdminUsagePanel } from "@/components/AdminUsagePanel";
import type { AdminUserRow, User } from "@/lib/types";

type Totals = {
  total_users: number;
  active_users: number;
  total_conversations: number;
  total_messages: number;
  total_user_messages: number;
};

type OverviewPulse = {
  liveCount: number;
  ollama: { ok: boolean; latencyMs: number; error?: string };
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
  loggedInUnlimited: boolean;
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

const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "usage", label: "Live usage", icon: Activity },
  { id: "users", label: "Users", icon: Users },
  { id: "models", label: "Models", icon: Bot },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "guardrails", label: "Guardrails", icon: ShieldAlert },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatSize = (bytes: number) => {
  if (!bytes) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

const fmtMs = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
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
    userMaxMessageChars: "12000",
    userHistoryLimit: "40",
    temperature: "0.7",
    numPredict: "-1",
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
        setError(usersData.error || "Failed to load users");
        return;
      }
      if (!modelsRes.ok && modelsData.error) {
        setError(modelsData.error);
      }
      if (!settingsRes.ok) {
        setError(settingsData.error || "Failed to load settings");
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
          userMaxMessageChars: String(s.userMaxMessageChars ?? 12000),
          userHistoryLimit: String(s.userHistoryLimit ?? 40),
          temperature: String(s.temperature ?? 0.7),
          numPredict: String(s.numPredict ?? -1),
        });
      }

      if (usageRes.ok && usageData.analytics?.summary && usageData.ollama) {
        setPulse({
          liveCount: usageData.live?.length ?? 0,
          ollama: usageData.ollama,
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
      setError("Network error loading admin data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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

  useEffect(() => {
    setUserPage(1);
  }, [userQuery, userFilter, userPageSize]);

  useEffect(() => {
    if (userPage > userTotalPages) {
      setUserPage(userTotalPages);
    }
  }, [userPage, userTotalPages]);

  const enabledModels = useMemo(
    () => models.filter((m) => m.is_enabled).length,
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
        setError(data.error || "Update failed");
        return;
      }
      setNotice(
        `${user.username} is now ${user.is_active === 1 ? "disabled" : "enabled"}`,
      );
      await load();
    } catch {
      setError("Network error");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (user: AdminUserRow) => {
    if (
      !window.confirm(
        `Delete user "${user.username}" and all their chats? This cannot be undone.`,
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
        setError(data.error || "Delete failed");
        return;
      }
      setNotice(`Deleted ${user.username}`);
      await load();
    } catch {
      setError("Network error");
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
        setError(data.error || "Could not update model");
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
        `${model.name} is now ${!model.is_enabled ? "enabled" : "disabled"} for users`,
      );
    } catch {
      setError("Network error");
    } finally {
      setBusyModel(null);
    }
  };

  const handleSaveDisplayName = async (model: ManagedModel) => {
    const next = (displayDrafts[model.name] ?? "").trim();
    const current = (model.display_name || model.name).trim();
    if (next === current) {
      setNotice("Display name unchanged");
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
        setError(data.error || "Could not save display name");
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
          : `Reset “${model.name}” to its Ollama name`,
      );
    } catch {
      setError("Network error");
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

    if (!Number.isFinite(guestDailyLimit) || guestDailyLimit < 0 || guestDailyLimit > 1000) {
      setError("Guest daily limit must be between 0 and 1000");
      return;
    }
    if (
      !Number.isFinite(guestMaxMessageChars) ||
      guestMaxMessageChars < 100 ||
      guestMaxMessageChars > 20000
    ) {
      setError("Guest max message length must be between 100 and 20000");
      return;
    }
    if (
      !Number.isFinite(guestHistoryLimit) ||
      guestHistoryLimit < 0 ||
      guestHistoryLimit > 40
    ) {
      setError("Guest history limit must be between 0 and 40");
      return;
    }
    if (
      !Number.isFinite(userMaxMessageChars) ||
      userMaxMessageChars < 500 ||
      userMaxMessageChars > 32000
    ) {
      setError("User max message length must be between 500 and 32000");
      return;
    }
    if (
      !Number.isFinite(userHistoryLimit) ||
      userHistoryLimit < 0 ||
      userHistoryLimit > 200
    ) {
      setError("User history limit must be between 0 and 200 (0 = all)");
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setError("Temperature must be between 0 and 2");
      return;
    }
    if (
      !Number.isFinite(numPredict) ||
      numPredict < -1 ||
      numPredict > 8192
    ) {
      setError("Max reply tokens must be -1 (default) or 1–8192");
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
        }),
      });
      const data = (await res.json()) as {
        settings?: AppSettings;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Could not save settings");
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
        });
      }
      setNotice("Settings saved.");
    } catch {
      setError("Network error");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#060a14] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(37,99,235,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 10%, rgba(14,165,233,0.1), transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-sky-400/10 bg-[#0a1220]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-sky-200/60 transition hover:bg-sky-500/10 hover:text-sky-100"
            >
              <ArrowLeft size={16} />
              Chat
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
                  <Shield size={16} className="text-sky-400" />
                  <h1 className="text-lg font-semibold tracking-tight">
                    Admin
                  </h1>
                </div>
                <p className="text-xs text-sky-200/45">
                  {admin.username} · SINAMGPT
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-400/15 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/20"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 py-6">
        <nav className="flex flex-wrap gap-1 rounded-2xl border border-sky-400/10 bg-[#0c1424]/80 p-1.5 backdrop-blur-md">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition sm:flex-none ${
                  active
                    ? "bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-[0_8px_24px_rgba(37,99,235,0.3)]"
                    : "text-sky-200/60 hover:bg-sky-500/10 hover:text-sky-100"
                }`}
              >
                <Icon size={16} />
                {label}
                {id === "users" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-white/20" : "bg-sky-500/15 text-sky-200/70"
                    }`}
                  >
                    {users.length}
                  </span>
                ) : null}
                {id === "models" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-white/20" : "bg-sky-500/15 text-sky-200/70"
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
          <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}

        {tab === "overview" ? (
          <div className="space-y-5 animate-fade-up">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                  pulse?.ollama.ok
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-red-500/15 text-red-200"
                }`}
              >
                <Server size={12} />
                Ollama {pulse?.ollama.ok ? "online" : "down"}
                {pulse ? ` · ${fmtMs(pulse.ollama.latencyMs)}` : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-100">
                <Radio
                  size={12}
                  className={pulse?.liveCount ? "animate-pulse" : ""}
                />
                {pulse?.liveCount ?? 0} live streams
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                  meta?.guardrailsOn
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-amber-500/15 text-amber-200"
                }`}
              >
                <ShieldAlert size={12} />
                Guardrails {meta?.guardrailsOn ? "on" : "off"}
                {meta ? ` · ${meta.keywordRules} hard rules` : ""}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                  meta?.knowledgeOn
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-sky-500/10 text-sky-200/70"
                }`}
              >
                <BookOpen size={12} />
                Knowledge {meta?.knowledgeOn ? "on" : "off"}
                {meta
                  ? ` · ${meta.knowledgeEnabled}/${meta.knowledgeDocs} docs`
                  : ""}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Requests today",
                  value: fmtNum(pulse?.summary.requests_today),
                  hint: `${fmtNum(pulse?.summary.requests_24h)} last 24h`,
                  icon: Activity,
                },
                {
                  label: "Avg first token",
                  value: fmtMs(pulse?.summary.avg_ttft_ms),
                  hint: `Avg reply ${fmtMs(pulse?.summary.avg_duration_ms)}`,
                  icon: Zap,
                },
                {
                  label: "Avg speed",
                  value:
                    pulse?.summary.avg_tokens_per_sec != null
                      ? `${pulse.summary.avg_tokens_per_sec} t/s`
                      : "—",
                  hint: `${fmtNum(pulse?.summary.requests_7d)} requests / 7d`,
                  icon: Gauge,
                },
                {
                  label: "Error rate",
                  value: errorRate != null ? `${errorRate}%` : "—",
                  hint: `${fmtNum(pulse?.summary.error_requests)} errors all-time`,
                  icon: Timer,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 px-4 py-4 backdrop-blur-md"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-sky-200/45">{card.label}</p>
                    <card.icon size={14} className="text-sky-400/70" />
                  </div>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">
                    {isLoading && !pulse ? "…" : card.value}
                  </p>
                  <p className="mt-1 text-xs text-sky-200/40">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  label: "Users",
                  value: totals?.total_users ?? "—",
                  hint: `${activeLast7d} active in 7d`,
                },
                {
                  label: "Accounts on",
                  value: totals?.active_users ?? "—",
                  hint: `${disabledUsers} disabled · ${adminUsers} admin`,
                },
                {
                  label: "Chats",
                  value: totals?.total_conversations ?? "—",
                  hint: "Saved conversations",
                },
                {
                  label: "Messages",
                  value: totals?.total_messages ?? "—",
                  hint: `${totals?.total_user_messages ?? "—"} user prompts`,
                },
                {
                  label: "Guest / User AI",
                  value: `${fmtNum(pulse?.summary.guest_requests)} / ${fmtNum(pulse?.summary.user_requests)}`,
                  hint: "All-time request split",
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/70 px-4 py-3"
                >
                  <p className="text-xs text-sky-200/45">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">
                    {isLoading ? "…" : card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-sky-200/40">{card.hint}</p>
                </div>
              ))}
            </div>

            <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Traffic · last 24h</h2>
                  <p className="text-xs text-sky-200/45">
                    Request volume by hour
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("usage")}
                  className="text-xs text-sky-300/70 transition hover:text-sky-100"
                >
                  Open live usage →
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
                        title={`${bucket.hour}: ${bucket.requests} requests`}
                      >
                        <div
                          className="w-full rounded-t-sm bg-gradient-to-t from-blue-600/80 to-sky-400/80 transition group-hover:from-blue-500 group-hover:to-sky-300"
                          style={{ height: `${heightPx}px` }}
                        />
                        <span className="mt-1 hidden text-[9px] text-sky-200/35 sm:block">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-sky-200/40">
                  No AI traffic in the last 24 hours yet
                </p>
              )}
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
                <h2 className="text-sm font-semibold">Top models</h2>
                <p className="mb-3 text-xs text-sky-200/45">
                  Most used · avg generation speed
                </p>
                {pulse?.byModel.length ? (
                  <ul className="space-y-2">
                    {pulse.byModel.map((row) => (
                      <li
                        key={row.model}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate text-sky-100/90">
                          {row.model}
                        </span>
                        <span className="shrink-0 text-xs text-sky-200/45">
                          {row.requests} req
                          {row.avg_tokens_per_sec != null
                            ? ` · ${row.avg_tokens_per_sec} t/s`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-sky-200/40">No model usage yet</p>
                )}
              </section>

              <section className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4">
                <h2 className="text-sm font-semibold">Top chatters</h2>
                <p className="mb-3 text-xs text-sky-200/45">
                  Highest request volume
                </p>
                {pulse?.topUsers.length ? (
                  <ul className="space-y-2">
                    {pulse.topUsers.map((row) => (
                      <li
                        key={`${row.source}-${row.username}`}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate">
                          <span className="text-sky-100/90">{row.username}</span>
                          <span className="ml-2 text-[11px] text-sky-200/35">
                            {row.source}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-sky-200/45">
                          {row.requests} req
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-sky-200/40">No chatters yet</p>
                )}
              </section>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => setTab("usage")}
                className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-500/[0.06]"
              >
                <p className="text-xs text-sky-200/45">AI performance</p>
                <p className="mt-1 text-xl font-semibold">Live usage</p>
                <p className="mt-1 text-sm text-sky-200/50">
                  Streams, latency history, Ollama ping
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("models")}
                className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-500/[0.06]"
              >
                <p className="text-xs text-sky-200/45">Models</p>
                <p className="mt-1 text-xl font-semibold">
                  {enabledModels} enabled
                </p>
                <p className="mt-1 text-sm text-sky-200/50">
                  {models.length - enabledModels} disabled · manage catalog
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("knowledge")}
                className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-500/[0.06]"
              >
                <p className="text-xs text-sky-200/45">Company knowledge</p>
                <p className="mt-1 text-xl font-semibold">
                  {meta?.knowledgeEnabled ?? "—"} live docs
                </p>
                <p className="mt-1 text-sm text-sky-200/50">
                  {meta?.knowledgeDocs ?? 0} total · RAG context for answers
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("settings")}
                className="rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 p-4 text-left transition hover:border-sky-400/25 hover:bg-sky-500/[0.06]"
              >
                <p className="text-xs text-sky-200/45">Access settings</p>
                <p className="mt-1 text-xl font-semibold">
                  {settings?.guestEnabled === false
                    ? "Guest off"
                    : `${settings?.guestDailyLimit ?? "—"} / day`}
                </p>
                <p className="mt-1 text-sm text-sky-200/50">
                  {settings?.registrationEnabled === false
                    ? "Registration closed"
                    : "Registration open"}{" "}
                  · temp {settings?.temperature ?? "—"}
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
          <section className="animate-fade-up overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 backdrop-blur-md">
            <div className="flex flex-col gap-3 border-b border-sky-400/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold">All users</h2>
                <p className="text-xs text-sky-200/45">
                  Search, filter, disable login, or delete accounts and chats
                  {filteredUsers.length
                    ? ` · showing ${userRangeStart}–${userRangeEnd} of ${filteredUsers.length}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40"
                  />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search username"
                    className="w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 py-2 pl-8 pr-3 text-sm outline-none placeholder:text-sky-200/30 focus:border-sky-400/40 sm:w-48"
                  />
                </div>
                <select
                  value={userFilter}
                  onChange={(e) =>
                    setUserFilter(
                      e.target.value as "all" | "active" | "disabled" | "admin",
                    )
                  }
                  className="rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 text-sm outline-none focus:border-sky-400/40"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="admin">Admins</option>
                </select>
                <label className="flex items-center gap-2 text-xs text-sky-200/55">
                  Rows
                  <select
                    value={userPageSize}
                    onChange={(e) =>
                      setUserPageSize(
                        Number(e.target.value) as (typeof USER_PAGE_SIZE_OPTIONS)[number],
                      )
                    }
                    className="rounded-xl border border-sky-400/15 bg-[#071018]/70 px-2 py-2 text-sm outline-none focus:border-sky-400/40"
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
              <table className="min-w-full text-left text-sm">
                <thead className="bg-sky-500/[0.04] text-xs uppercase tracking-wide text-sky-200/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Registered</th>
                    <th className="px-4 py-3 font-medium">Last active</th>
                    <th className="px-4 py-3 font-medium">Chats</th>
                    <th className="px-4 py-3 font-medium">Msgs</th>
                    <th className="px-4 py-3 font-medium">Prompts</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-sky-200/45"
                      >
                        Loading…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-sky-200/45"
                      >
                        No users match this filter
                      </td>
                    </tr>
                  ) : (
                    pagedUsers.map((user) => {
                      const isSelf = user.id === admin.id;
                      const isBusy = busyId === user.id;
                      return (
                        <tr
                          key={user.id}
                          className="border-t border-sky-400/10"
                        >
                          <td className="px-4 py-3 font-medium">
                            {user.username}
                            {isSelf ? (
                              <span className="ml-2 text-xs text-sky-200/40">
                                (you)
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.role === "admin"
                                  ? "bg-sky-500/15 text-sky-200"
                                  : "bg-white/5 text-sky-200/70"
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.is_active === 1
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-red-500/15 text-red-300"
                              }`}
                            >
                              {user.is_active === 1 ? "active" : "disabled"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sky-200/50">
                            {formatDate(user.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sky-200/50">
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
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-sky-100 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {user.is_active === 1 ? (
                                  <>
                                    <UserX size={14} /> Disable
                                  </>
                                ) : (
                                  <>
                                    <UserCheck size={14} /> Enable
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || isSelf}
                                onClick={() => void handleDelete(user)}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 size={14} />
                                Delete
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-400/10 px-4 py-3">
              <p className="text-xs text-sky-200/45">
                Page {safeUserPage} of {userTotalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeUserPage <= 1}
                  onClick={() => setUserPage(safeUserPage - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safeUserPage >= userTotalPages}
                  onClick={() => setUserPage(safeUserPage + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "models" ? (
          <section className="animate-fade-up overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 backdrop-blur-md">
            <div className="border-b border-sky-400/10 px-4 py-3">
              <h2 className="text-sm font-semibold">Ollama models</h2>
              <p className="text-xs text-sky-200/45">
                Edit the display name shown in chat pickers. Clear + save to
                reset to the Ollama id.
              </p>
            </div>

            {isLoading ? (
              <p className="px-4 py-10 text-center text-sm text-sky-200/45">
                Loading…
              </p>
            ) : models.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-sky-200/45">
                No Ollama models found. Run{" "}
                <code className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-200">
                  ollama list
                </code>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-sky-500/[0.04] text-xs uppercase tracking-wide text-sky-200/45">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Ollama id</th>
                      <th className="px-4 py-2.5 font-medium">Size</th>
                      <th className="min-w-[220px] px-4 py-2.5 font-medium">
                        Display name
                      </th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model) => {
                      const busy = busyModel === model.name;
                      const draft =
                        displayDrafts[model.name] ?? model.display_name;
                      const dirty =
                        draft.trim() !==
                        (model.display_name || model.name).trim();
                      return (
                        <tr
                          key={model.name}
                          className="border-t border-sky-400/10"
                        >
                          <td className="px-4 py-2.5">
                            <p className="max-w-[180px] truncate font-mono text-xs text-sky-100/90">
                              {model.name}
                            </p>
                            {model.modified_at ? (
                              <p className="mt-0.5 text-[11px] text-sky-200/35">
                                {formatDate(model.modified_at)}
                              </p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-sky-200/55">
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
                                className="w-full max-w-[220px] rounded-lg border border-sky-400/15 bg-[#071018]/70 px-2.5 py-1.5 text-sm outline-none placeholder:text-sky-200/30 focus:border-sky-400/40"
                              />
                              <button
                                type="button"
                                disabled={busy || !dirty}
                                onClick={() =>
                                  void handleSaveDisplayName(model)
                                }
                                className="shrink-0 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busy && dirty ? "…" : "Save"}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                model.is_enabled
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-red-500/15 text-red-300"
                              }`}
                            >
                              {model.is_enabled ? "enabled" : "disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleToggleModel(model)}
                              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
                                model.is_enabled
                                  ? "border border-sky-400/15 text-sky-100 hover:bg-sky-500/10"
                                  : "bg-gradient-to-r from-blue-600 to-sky-500 text-white"
                              }`}
                            >
                              {busy && !dirty
                                ? "…"
                                : model.is_enabled
                                  ? "Disable"
                                  : "Enable"}
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
          <div className="animate-fade-up space-y-4">
            <section className="overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 backdrop-blur-md">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">App settings</h2>
                  <p className="text-xs text-sky-200/45">
                    Access, defaults, context limits, and generation behavior
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => void handleSaveSettings()}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400 disabled:opacity-60"
                >
                  {savingSettings ? "Saving…" : "Save settings"}
                </button>
              </div>

              <div className="space-y-5 px-4 py-5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200/45">
                    Guest try-chat
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/12 bg-sky-500/[0.04] px-3 py-3 text-sm sm:col-span-2 lg:col-span-1">
                      <input
                        type="checkbox"
                        checked={settingsDraft.guestEnabled}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            guestEnabled: e.target.checked,
                          }))
                        }
                      />
                      Guest chat enabled
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      Daily messages
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={settingsDraft.guestDailyLimit}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            guestDailyLimit: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        0 = guests blocked by quota
                      </span>
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      Max message chars
                      <input
                        type="number"
                        min={100}
                        max={20000}
                        value={settingsDraft.guestMaxMessageChars}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            guestMaxMessageChars: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      History turns
                      <input
                        type="number"
                        min={0}
                        max={40}
                        value={settingsDraft.guestHistoryLimit}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            guestHistoryLimit: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        Past messages sent to the model
                      </span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-sky-400/10 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200/45">
                    Accounts
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/12 bg-sky-500/[0.04] px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={settingsDraft.registrationEnabled}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            registrationEnabled: e.target.checked,
                          }))
                        }
                      />
                      Allow new user registration
                    </label>
                    <p className="rounded-xl border border-sky-400/10 px-3 py-3 text-xs text-sky-200/45">
                      Logged-in chat stays{" "}
                      <span className="font-medium text-emerald-300">
                        unlimited
                      </span>{" "}
                      by message count. Use max chars / history below to control
                      load.
                    </p>
                  </div>
                </div>

                <div className="border-t border-sky-400/10 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200/45">
                    Chat & model defaults
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block text-sm text-sky-100/80 sm:col-span-2 lg:col-span-1">
                      Default model
                      <select
                        value={settingsDraft.defaultModel}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            defaultModel: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      >
                        <option value="">First enabled / env default</option>
                        {models.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.display_name || m.name}
                            {!m.is_enabled ? " (disabled)" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        Used when guest/user opens a new chat
                      </span>
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      User max message chars
                      <input
                        type="number"
                        min={500}
                        max={32000}
                        value={settingsDraft.userMaxMessageChars}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            userMaxMessageChars: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      User history messages
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={settingsDraft.userHistoryLimit}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            userHistoryLimit: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        0 = send full conversation to the model
                      </span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-sky-400/10 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-sky-200/45">
                    Generation
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-sky-100/80">
                      Temperature
                      <input
                        type="number"
                        min={0}
                        max={2}
                        step={0.05}
                        value={settingsDraft.temperature}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            temperature: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        0 = focused · 0.7 default · 1.2+ more creative
                      </span>
                    </label>
                    <label className="block text-sm text-sky-100/80">
                      Max reply tokens
                      <input
                        type="number"
                        min={-1}
                        max={8192}
                        value={settingsDraft.numPredict}
                        onChange={(e) =>
                          setSettingsDraft((d) => ({
                            ...d,
                            numPredict: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                      />
                      <span className="mt-1 block text-[11px] text-sky-200/40">
                        -1 = Ollama default · lower = shorter/faster replies
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-400/10 px-4 py-3">
                <p className="text-xs text-sky-200/40">
                  Current saved default model:{" "}
                  <span className="text-sky-200/70">
                    {settings?.defaultModel || "env / first enabled"}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => void handleSaveSettings()}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingSettings ? "Saving…" : "Save settings"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
};
