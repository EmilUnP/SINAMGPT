"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Library,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
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
import { useConfirm } from "@/components/ConfirmDialog";
import { useTranslations } from "@/components/LocaleProvider";
import type {
  KnowledgeCategory,
  KnowledgeDoc,
  KnowledgeSettings,
} from "@/lib/knowledge";
import type { Project } from "@/lib/types";
import type { MessageKey } from "@/messages";

type Props = {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type KnowledgeTab = "overview" | "library" | "settings";

const categories: KnowledgeCategory[] = [
  "company",
  "project",
  "product",
  "faq",
  "other",
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const CATEGORY_KEYS: Record<KnowledgeCategory, MessageKey> = {
  company: "admin.knowledge.catCompany",
  project: "admin.knowledge.catProject",
  product: "admin.knowledge.catProduct",
  faq: "admin.knowledge.catFaq",
  other: "admin.knowledge.catOther",
};

const emptyForm = {
  title: "",
  category: "company" as KnowledgeCategory,
  content: "",
  tags: "",
  project_id: "" as string,
  priority: 50,
  always_include: false,
  is_enabled: true,
};

const formatChars = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

export const AdminKnowledgePanel = ({ onNotice, onError }: Props) => {
  const t = useTranslations();
  const confirm = useConfirm();
  const [tab, setTab] = useState<KnowledgeTab>("overview");
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [settings, setSettings] = useState<KnowledgeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | KnowledgeCategory>(
    "all",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    10,
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [knowledgeRes, projectsRes] = await Promise.all([
        fetch("/api/admin/knowledge"),
        fetch("/api/projects?all=1"),
      ]);
      const data = (await knowledgeRes.json()) as {
        docs?: KnowledgeDoc[];
        settings?: KnowledgeSettings;
        error?: string;
      };
      if (!knowledgeRes.ok) {
        onError(data.error || t("admin.knowledge.couldNotSave"));
        return;
      }
      setDocs(data.docs ?? []);
      setSettings(data.settings ?? null);
      if (projectsRes.ok) {
        const pdata = (await projectsRes.json()) as { projects?: Project[] };
        setProjects(pdata.projects ?? []);
      }
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsLoading(false);
    }
  }, [onError, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen, closeModal]);

  const stats = useMemo(() => {
    const enabled = docs.filter((d) => d.is_enabled === 1);
    const disabled = docs.length - enabled.length;
    const always = docs.filter((d) => d.always_include === 1).length;
    const projectScoped = docs.filter((d) => d.project_id).length;
    const totalChars = docs.reduce((sum, d) => sum + d.content.length, 0);
    const byCategory = categories.map((c) => ({
      category: c,
      total: docs.filter((d) => d.category === c).length,
      enabled: docs.filter((d) => d.category === c && d.is_enabled === 1).length,
    }));
    const avgPriority =
      docs.length > 0
        ? Math.round(
            docs.reduce((sum, d) => sum + d.priority, 0) / docs.length,
          )
        : 0;
    const topPriority = [...docs]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);
    return {
      enabled: enabled.length,
      disabled,
      always,
      projectScoped,
      totalChars,
      byCategory,
      avgPriority,
      topPriority,
    };
  }, [docs]);

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((doc) => {
      if (filter === "enabled" && doc.is_enabled !== 1) return false;
      if (filter === "disabled" && doc.is_enabled === 1) return false;
      if (categoryFilter !== "all" && doc.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q) ||
        doc.tags.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
      );
    });
  }, [docs, query, filter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedDocs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredDocs.slice(start, start + pageSize);
  }, [filteredDocs, safePage, pageSize]);
  const rangeStart =
    filteredDocs.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredDocs.length);

  /*
   * Changing a filter restarts pagination. Resetting in the handler keeps it
   * in the same commit as the filter change; an effect would render once with
   * the stale page first. An over-range page needs no effect at all — safePage
   * clamps during render and every consumer below reads safePage.
   */
  const changeQuery = (value: string) => {
    setQuery(value);
    setPage(1);
  };
  const changeFilter = (value: "all" | "enabled" | "disabled") => {
    setFilter(value);
    setPage(1);
  };
  const changeCategoryFilter = (value: "all" | KnowledgeCategory) => {
    setCategoryFilter(value);
    setPage(1);
  };
  const changePageSize = (value: (typeof PAGE_SIZE_OPTIONS)[number]) => {
    setPageSize(value);
    setPage(1);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (doc: KnowledgeDoc) => {
    setEditingId(doc.id);
    setForm({
      title: doc.title,
      category: doc.category,
      content: doc.content,
      tags: doc.tags,
      project_id: doc.project_id ?? "",
      priority: doc.priority,
      always_include: doc.always_include === 1,
      is_enabled: doc.is_enabled === 1,
    });
    setModalOpen(true);
  };

  const projectName = (id: string | null) =>
    id ? projects.find((p) => p.id === id)?.name ?? t("admin.knowledge.project") : null;

  const handleSaveDoc = async () => {
    if (!form.title.trim() || form.content.trim().length < 10) {
      onError(t("admin.knowledge.factsHint"));
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...form,
        project_id: form.project_id.trim() || null,
      };
      const res = await fetch(
        editingId ? `/api/admin/knowledge/${editingId}` : "/api/admin/knowledge",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onError(data.error || t("admin.knowledge.couldNotSave"));
        return;
      }
      onNotice(
        editingId
          ? t("admin.knowledge.editEntry")
          : t("admin.knowledge.addEntryTitle"),
      );
      closeModal();
      await load();
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (doc: KnowledgeDoc) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("admin.knowledge.deleteConfirm", { title: doc.title }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        onError(data.error || t("admin.chrome.delete"));
        return;
      }
      onNotice(`${t("admin.chrome.delete")} ${doc.title}`);
      if (editingId === doc.id) closeModal();
      await load();
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (doc: KnowledgeDoc) => {
    const res = await fetch(`/api/admin/knowledge/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: doc.is_enabled !== 1 }),
    });
    if (!res.ok) {
      onError(t("admin.knowledge.couldNotSave"));
      return;
    }
    await load();
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", settings }),
      });
      const data = (await res.json()) as {
        settings?: KnowledgeSettings;
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || t("admin.knowledge.couldNotSave"));
        return;
      }
      if (data.settings) setSettings(data.settings);
      onNotice(t("admin.knowledge.settingsSaved"));
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeed = async (mode: "add" | "refresh" | "replace") => {
    if (mode === "replace") {
      const ok = await confirm({
        title: t("admin.knowledge.replaceAll"),
        description: t("admin.knowledge.replaceConfirm"),
        confirmLabel: t("admin.knowledge.replaceAll"),
        tone: "danger",
      });
      if (!ok) return;
    } else if (mode === "refresh") {
      const ok = await confirm({
        title: t("admin.knowledge.refreshPack"),
        description: t("admin.knowledge.refreshConfirm"),
        confirmLabel: t("admin.knowledge.refreshPack"),
        tone: "danger",
      });
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "seed_sinam",
          replaceAll: mode === "replace",
          overwriteExisting: mode === "refresh",
        }),
      });
      const data = (await res.json()) as {
        count?: number;
        updated?: number;
        mode?: string;
        docs?: KnowledgeDoc[];
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || t("admin.knowledge.seedFailed"));
        return;
      }
      setDocs(data.docs ?? []);
      if (mode === "replace") {
        onNotice(t("admin.knowledge.replaced", { n: data.count ?? 0 }));
      } else if (mode === "refresh") {
        onNotice(
          t("admin.knowledge.refreshed", {
            added: data.count ?? 0,
            updated: data.updated ?? 0,
          }),
        );
      } else {
        onNotice(t("admin.knowledge.addedMissing", { n: data.count ?? 0 }));
      }
      setTab("library");
    } catch {
      onError(t("admin.chrome.networkError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminPanelCard className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
        {t("admin.knowledge.loading")}
      </AdminPanelCard>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={BookOpen}
            title={t("admin.knowledge.title")}
            description={t("admin.knowledge.description")}
            actions={
              <button type="button" onClick={openCreate} className={adminBtnPrimary}>
                <Plus size={14} />
                {t("admin.knowledge.addEntry")}
              </button>
            }
          />
          <AdminSubtabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: t("admin.knowledge.tabOverview"), icon: Sparkles },
              {
                id: "library",
                label: t("admin.knowledge.tabLibrary"),
                icon: Library,
                count: docs.length,
              },
              { id: "settings", label: t("admin.knowledge.tabSettings"), icon: Settings2 },
            ]}
          />
        </div>

        {tab === "overview" ? (
          <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
            <AdminStatGrid>
              <AdminStatCard
                label={t("admin.knowledge.documents")}
                value={docs.length}
                hint={t("admin.knowledge.enabledOff", {
                  enabled: stats.enabled,
                  disabled: stats.disabled,
                })}
                tone="info"
              />
              <AdminStatCard
                label={t("admin.knowledge.corpusSize")}
                value={formatChars(stats.totalChars)}
                hint={t("admin.knowledge.capHint", {
                  chars: settings?.maxChars ?? "—",
                  docs: settings?.maxDocs ?? "—",
                })}
              />
              <AdminStatCard
                label={t("admin.knowledge.projectScoped")}
                value={stats.projectScoped}
                hint={t("admin.knowledge.projectHint")}
              />
              <AdminStatCard
                label={t("admin.knowledge.alwaysInclude")}
                value={stats.always}
                hint={t("admin.knowledge.alwaysHint")}
                tone={stats.always > 0 ? "warn" : "default"}
              />
            </AdminStatGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.knowledge.coverage")}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  {t("admin.knowledge.coverageHint")}
                </p>
                <ul className="mt-3 space-y-2">
                  {stats.byCategory.map((row) => {
                    const pct =
                      docs.length > 0
                        ? Math.round((row.total / docs.length) * 100)
                        : 0;
                    return (
                      <li key={row.category}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              changeCategoryFilter(row.category);
                              setTab("library");
                            }}
                            className="font-medium text-[var(--admin-fg)] hover:text-[var(--accent)]"
                          >
                            {t(CATEGORY_KEYS[row.category])}
                          </button>
                          <span className="tabular-nums text-[var(--admin-muted)]">
                            {row.enabled}/{row.total}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-surface-soft)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  {t("admin.knowledge.highestPriority")}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  {t("admin.knowledge.avgPriority", { n: stats.avgPriority })}
                </p>
                {stats.topPriority.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--admin-muted)]">
                    {t("admin.knowledge.noDocs")}
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--admin-border)]">
                    {stats.topPriority.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => openEdit(doc)}
                          className="flex w-full items-center justify-between gap-2 py-2 text-left hover:opacity-90"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-[var(--admin-fg)]">
                              {doc.title}
                            </span>
                            <span className="text-[11px] text-[var(--admin-muted)]">
                              {t(CATEGORY_KEYS[doc.category])}
                              {doc.is_enabled !== 1
                                ? t("admin.knowledge.disabledSuffix")
                                : ""}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-md bg-[var(--chip-info-bg)] px-2 py-0.5 text-xs tabular-nums text-[var(--admin-muted)]">
                            {doc.priority}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <AdminHint>
              <strong className="text-[var(--admin-fg)]">
                {t("admin.knowledge.editableLabel")}
              </strong>{" "}
              {t("admin.knowledge.editableHere")}
            </AdminHint>
          </div>
        ) : null}

        {tab === "library" ? (
          <div className="border-t border-[var(--admin-border)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {t("admin.knowledge.libraryTitle", {
                    n:
                      filteredDocs.length !== docs.length
                        ? `${filteredDocs.length} / ${docs.length}`
                        : filteredDocs.length,
                  })}
                </h3>
                <p className="text-xs text-[var(--admin-muted)]">
                  {filteredDocs.length
                    ? t("admin.knowledge.showing", {
                        start: rangeStart,
                        end: rangeEnd,
                      })
                    : t("admin.knowledge.noMatches")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
                  />
                  <input
                    value={query}
                    onChange={(e) => changeQuery(e.target.value)}
                    placeholder={t("admin.knowledge.search")}
                    className="w-48 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--accent)]/50"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    changeCategoryFilter(
                      e.target.value as "all" | KnowledgeCategory,
                    )
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="all">{t("admin.knowledge.allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {t(CATEGORY_KEYS[c])}
                    </option>
                  ))}
                </select>
                <select
                  value={filter}
                  onChange={(e) =>
                    changeFilter(
                      e.target.value as "all" | "enabled" | "disabled",
                    )
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="all">{t("admin.knowledge.allStatus")}</option>
                  <option value="enabled">{t("admin.knowledge.enabled")}</option>
                  <option value="disabled">{t("admin.knowledge.disabled")}</option>
                </select>
                <select
                  value={pageSize}
                  onChange={(e) =>
                    changePageSize(
                      Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                    )
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2 py-1.5 text-sm outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} {t("admin.chrome.rows")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("admin.knowledge.colTitle")}</th>
                    <th>{t("admin.knowledge.colCategory")}</th>
                    <th>{t("admin.knowledge.colPriority")}</th>
                    <th className="min-w-[220px]">{t("admin.knowledge.colPreview")}</th>
                    <th>{t("admin.knowledge.colStatus")}</th>
                    <th>{t("admin.knowledge.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-[var(--admin-muted)]"
                      >
                        {docs.length === 0
                          ? t("admin.knowledge.noDocs")
                          : t("admin.knowledge.noMatches")}
                      </td>
                    </tr>
                  ) : (
                    pagedDocs.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-[var(--admin-border)] last:border-0"
                      >
                        <td className="px-4 py-2.5">
                          <p className="max-w-[200px] truncate font-medium">
                            {doc.title}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {doc.always_include === 1 ? (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-[var(--status-warn-fg)]">
                                {t("admin.knowledge.alwaysInclude")}
                              </span>
                            ) : null}
                            {doc.project_id ? (
                              <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                                {projectName(doc.project_id)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[var(--admin-muted)]">
                          {t(CATEGORY_KEYS[doc.category])}
                        </td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-[var(--admin-muted)]">
                          {doc.priority}
                        </td>
                        <td className="max-w-[280px] px-4 py-2.5">
                          <p className="line-clamp-2 text-xs text-[var(--admin-muted)]">
                            {doc.content}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`status-pill ${
                              doc.is_enabled === 1 ? "status-ok" : "status-bad"
                            }`}
                          >
                            {doc.is_enabled === 1
                              ? t("admin.chrome.on")
                              : t("admin.chrome.off")}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(doc)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--admin-fg)] hover:bg-[var(--hover)]"
                            >
                              <Pencil size={12} />
                              {t("admin.knowledge.editEntry")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggle(doc)}
                              className="rounded-lg px-2 py-1 text-xs text-[var(--admin-muted)] hover:bg-[var(--hover)]"
                            >
                              {doc.is_enabled === 1
                                ? t("admin.chrome.disable")
                                : t("admin.chrome.enable")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(doc)}
                              className="rounded-lg p-1 text-[var(--status-bad-fg)] hover:bg-red-500/10"
                              aria-label={t("admin.chrome.delete")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
              <p className="text-xs text-[var(--admin-muted)]">
                {safePage} / {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  className={adminBtnGhost}
                >
                  <ChevronLeft size={14} />
                  {t("admin.chrome.prev")}
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  className={adminBtnGhost}
                >
                  {t("admin.chrome.next")}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "settings" && settings ? (
          <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminToggleCard
                emphasize
                checked={settings.enabled}
                onChange={(v) => setSettings({ ...settings, enabled: v })}
                label={t("admin.knowledge.knowledgeEnabled")}
                hint={t("admin.knowledge.factsHint")}
              />
              <AdminToggleCard
                checked={settings.showCitations}
                onChange={(v) => setSettings({ ...settings, showCitations: v })}
                label={t("admin.knowledge.showCitations")}
                hint={t("admin.knowledge.showCitations")}
              />
              <AdminToggleCard
                checked={settings.applyToUsers}
                onChange={(v) => setSettings({ ...settings, applyToUsers: v })}
                label={t("admin.knowledge.applyToUsers")}
                hint={t("admin.knowledge.applyToUsers")}
              />
              <AdminToggleCard
                checked={settings.applyToGuests}
                onChange={(v) => setSettings({ ...settings, applyToGuests: v })}
                label={t("admin.knowledge.applyToGuests")}
                hint={t("admin.knowledge.applyToGuests")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[var(--admin-fg)]">
                {t("admin.knowledge.maxDocs")}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.maxDocs}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxDocs: Number(e.target.value),
                    })
                  }
                  className={adminFieldClass}
                />
                <span className="mt-1 block text-xs text-[var(--admin-muted)]">
                  {t("admin.knowledge.maxDocsHint")}
                </span>
              </label>
              <label className="block text-sm text-[var(--admin-fg)]">
                {t("admin.knowledge.maxChars")}
                <input
                  type="number"
                  min={500}
                  max={5000}
                  value={settings.maxChars}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxChars: Number(e.target.value),
                    })
                  }
                  className={adminFieldClass}
                />
                <span className="mt-1 block text-xs text-[var(--admin-muted)]">
                  {t("admin.knowledge.maxCharsHint")}
                </span>
              </label>
            </div>

            <AdminHint>
              <strong className="text-[var(--admin-fg)]">
                {t("admin.knowledge.starterPack")}
              </strong>{" "}
              (from{" "}
              <a
                href="https://sinam.net"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline underline-offset-2"
              >
                sinam.net
              </a>
              ) {t("admin.knowledge.starterHint")}
            </AdminHint>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveSettings()}
                className={adminBtnPrimary}
              >
                {isSaving ? t("admin.chrome.saving") : t("admin.chrome.saveSettings")}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed("add")}
                className={adminBtnGhost}
              >
                {t("admin.knowledge.addMissing")}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed("refresh")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 px-3.5 py-2 text-sm text-[var(--status-warn-fg)] transition hover:bg-amber-500/10 disabled:opacity-60"
              >
                {t("admin.knowledge.refreshPack")}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed("replace")}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--status-bad-border)] px-3.5 py-2 text-sm text-[var(--status-bad-fg)] transition hover:bg-[var(--status-bad-bg)] disabled:opacity-60"
              >
                {t("admin.knowledge.replaceAll")}
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanelCard>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={closeModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-modal-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-4 py-3 backdrop-blur">
              <div>
                <h3
                  id="knowledge-modal-title"
                  className="text-sm font-semibold"
                >
                  {editingId
                    ? t("admin.knowledge.editEntry")
                    : t("admin.knowledge.addEntryTitle")}
                </h3>
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("admin.knowledge.factsHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                aria-label={t("admin.chrome.close")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-sm text-[var(--admin-fg)]">
                  {t("admin.knowledge.titleField")}
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className={adminFieldClass}
                    placeholder={t("admin.knowledge.titlePlaceholder")}
                    autoFocus
                  />
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  {t("admin.knowledge.category")}
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value as KnowledgeCategory,
                      })
                    }
                    className={adminFieldClass}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {t(CATEGORY_KEYS[c])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm text-[var(--admin-fg)]">
                {t("admin.knowledge.content")}
                <textarea
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  rows={9}
                  className={`${adminFieldClass} resize-y`}
                  placeholder={t("admin.knowledge.contentPlaceholder")}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <label className="block text-sm text-[var(--admin-fg)]">
                  {t("admin.knowledge.tags")}
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({ ...form, tags: e.target.value })
                    }
                    className={adminFieldClass}
                    placeholder={t("admin.knowledge.tagsPlaceholder")}
                  />
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  {t("admin.knowledge.project")}
                  <select
                    value={form.project_id}
                    onChange={(e) =>
                      setForm({ ...form, project_id: e.target.value })
                    }
                    className={adminFieldClass}
                  >
                    <option value="">{t("admin.knowledge.allChats")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  {t("admin.knowledge.priority")}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: Number(e.target.value) })
                    }
                    className={adminFieldClass}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-[var(--admin-fg)]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.always_include}
                    onChange={(e) =>
                      setForm({ ...form, always_include: e.target.checked })
                    }
                  />
                  {t("admin.knowledge.alwaysIncludeFlag")}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(e) =>
                      setForm({ ...form, is_enabled: e.target.checked })
                    }
                  />
                  {t("admin.knowledge.enabledFlag")}
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-4 py-3 backdrop-blur">
              <button type="button" onClick={closeModal} className={adminBtnGhost}>
                {t("admin.chrome.close")}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveDoc()}
                className={adminBtnPrimary}
              >
                <Plus size={14} />
                {isSaving
                  ? t("admin.chrome.saving")
                  : editingId
                    ? t("admin.chrome.saveChanges")
                    : t("admin.knowledge.addEntry")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
