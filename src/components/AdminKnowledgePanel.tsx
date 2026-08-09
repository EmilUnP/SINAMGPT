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
} from "@/components/AdminChrome";
import type {
  KnowledgeCategory,
  KnowledgeDoc,
  KnowledgeSettings,
} from "@/lib/knowledge";
import type { Project } from "@/lib/types";

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
        onError(data.error || "Failed to load knowledge");
        return;
      }
      setDocs(data.docs ?? []);
      setSettings(data.settings ?? null);
      if (projectsRes.ok) {
        const pdata = (await projectsRes.json()) as { projects?: Project[] };
        setProjects(pdata.projects ?? []);
      }
    } catch {
      onError("Network error loading knowledge");
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
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

  useEffect(() => {
    setPage(1);
  }, [query, filter, categoryFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    id ? projects.find((p) => p.id === id)?.name ?? "Project" : null;

  const handleSaveDoc = async () => {
    if (!form.title.trim() || form.content.trim().length < 10) {
      onError("Title and content (min 10 chars) are required");
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
        onError(data.error || "Could not save document");
        return;
      }
      onNotice(editingId ? "Knowledge entry updated" : "Knowledge entry added");
      closeModal();
      await load();
    } catch {
      onError("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (doc: KnowledgeDoc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        onError(data.error || "Delete failed");
        return;
      }
      onNotice(`Deleted ${doc.title}`);
      if (editingId === doc.id) closeModal();
      await load();
    } catch {
      onError("Network error");
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
      onError("Could not update entry");
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
        onError(data.error || "Could not save settings");
        return;
      }
      if (data.settings) setSettings(data.settings);
      onNotice("Knowledge settings saved");
    } catch {
      onError("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeed = async (replaceAll: boolean) => {
    if (
      replaceAll &&
      !window.confirm(
        "Replace ALL knowledge docs with the official SINAM starter pack from sinam.net?",
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_sinam", replaceAll }),
      });
      const data = (await res.json()) as {
        count?: number;
        mode?: string;
        docs?: KnowledgeDoc[];
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || "Seed failed");
        return;
      }
      setDocs(data.docs ?? []);
      onNotice(
        replaceAll
          ? `Replaced with ${data.count ?? 0} SINAM knowledge entries`
          : `Added ${data.count ?? 0} missing SINAM entries`,
      );
      setTab("library");
    } catch {
      onError("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminPanelCard className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
        Loading company knowledge…
      </AdminPanelCard>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={BookOpen}
            title="Company knowledge"
            description="Local facts injected into chat when a question looks company-related (keyword RAG, EN / AZ / RU / TR). Citations can show which docs were used."
            actions={
              <button type="button" onClick={openCreate} className={adminBtnPrimary}>
                <Plus size={14} />
                Add entry
              </button>
            }
          />
          <AdminSubtabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview", icon: Sparkles },
              {
                id: "library",
                label: "Library",
                icon: Library,
                count: docs.length,
              },
              { id: "settings", label: "Settings", icon: Settings2 },
            ]}
          />
        </div>

        {tab === "overview" ? (
          <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
            <AdminStatGrid>
              <AdminStatCard
                label="Documents"
                value={docs.length}
                hint={`${stats.enabled} enabled · ${stats.disabled} off`}
                tone="info"
              />
              <AdminStatCard
                label="Corpus size"
                value={formatChars(stats.totalChars)}
                hint={`Cap per reply: ${settings?.maxChars ?? "—"} chars · max ${settings?.maxDocs ?? "—"} docs`}
              />
              <AdminStatCard
                label="Project-scoped"
                value={stats.projectScoped}
                hint="Boosted when chat is in that project folder"
              />
              <AdminStatCard
                label="Always-include"
                value={stats.always}
                hint="Only injected on company-intent questions"
                tone={stats.always > 0 ? "warn" : "default"}
              />
            </AdminStatGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--admin-border)] p-3.5">
                <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
                  Coverage by category
                </h3>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  Enabled vs total per bucket
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
                              setCategoryFilter(row.category);
                              setTab("library");
                            }}
                            className="font-medium capitalize text-[var(--admin-fg)] hover:text-[var(--accent)]"
                          >
                            {row.category}
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
                  Highest priority
                </h3>
                <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                  Avg priority {stats.avgPriority} · click to edit
                </p>
                {stats.topPriority.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--admin-muted)]">
                    No documents yet. Seed the SINAM pack or add an entry.
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
                            <span className="text-[11px] capitalize text-[var(--admin-muted)]">
                              {doc.category}
                              {doc.is_enabled !== 1 ? " · disabled" : ""}
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
              <strong className="text-[var(--admin-fg)]">How it works:</strong>{" "}
              On each message we score docs by keywords/tags (not embeddings).
              Greetings and chit-chat skip injection so language stays stable.
              Project-tagged docs get a boost when the chat sits in that
              project. Turn on citations in Settings so answers show{" "}
              <em>From: …</em> sources.
            </AdminHint>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTab("library")}
                className={adminBtnGhost}
              >
                Open library
              </button>
              <button
                type="button"
                onClick={() => setTab("settings")}
                className={adminBtnGhost}
              >
                Retrieval settings
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed(false)}
                className={adminBtnGhost}
              >
                Add SINAM pack
              </button>
            </div>
          </div>
        ) : null}

        {tab === "library" ? (
          <div className="border-t border-[var(--admin-border)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">
                  Library ({filteredDocs.length}
                  {filteredDocs.length !== docs.length ? ` / ${docs.length}` : ""}
                  )
                </h3>
                <p className="text-xs text-[var(--admin-muted)]">
                  {filteredDocs.length
                    ? `Showing ${rangeStart}–${rangeEnd}`
                    : "No matches"}
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
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-48 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--accent)]/50"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) =>
                    setCategoryFilter(
                      e.target.value as "all" | KnowledgeCategory,
                    )
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={filter}
                  onChange={(e) =>
                    setFilter(e.target.value as "all" | "enabled" | "disabled")
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="all">All status</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
                <select
                  value={pageSize}
                  onChange={(e) =>
                    setPageSize(
                      Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                    )
                  }
                  className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-input)] px-2 py-1.5 text-sm outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}/page
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-y border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[11px] uppercase tracking-wide text-[var(--admin-muted)]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Title</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Priority</th>
                    <th className="min-w-[220px] px-4 py-2.5 font-medium">
                      Preview
                    </th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
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
                          ? "No docs yet. Add an entry or seed the SINAM pack."
                          : "No entries match this search/filter."}
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
                                always
                              </span>
                            ) : null}
                            {doc.project_id ? (
                              <span className="rounded bg-[var(--accent)]/12 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                                {projectName(doc.project_id)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs capitalize text-[var(--admin-muted)]">
                          {doc.category}
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
                            {doc.is_enabled === 1 ? "on" : "off"}
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
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggle(doc)}
                              className="rounded-lg px-2 py-1 text-xs text-[var(--admin-muted)] hover:bg-[var(--hover)]"
                            >
                              {doc.is_enabled === 1 ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(doc)}
                              className="rounded-lg p-1 text-[var(--status-bad-fg)] hover:bg-red-500/10"
                              aria-label="Delete"
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
                Page {safePage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  className={adminBtnGhost}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  className={adminBtnGhost}
                >
                  Next
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
                label="Knowledge retrieval on"
                hint="Master switch — when off, no docs are injected into chats"
              />
              <AdminToggleCard
                checked={settings.showCitations}
                onChange={(v) => setSettings({ ...settings, showCitations: v })}
                label="Show citations"
                hint="Assistant answers can show From: doc titles when sources matched"
              />
              <AdminToggleCard
                checked={settings.applyToUsers}
                onChange={(v) => setSettings({ ...settings, applyToUsers: v })}
                label="Apply to logged-in users"
                hint="Saved /chat conversations"
              />
              <AdminToggleCard
                checked={settings.applyToGuests}
                onChange={(v) => setSettings({ ...settings, applyToGuests: v })}
                label="Apply to guests"
                hint="Home page try-chat (still respects daily limits)"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[var(--admin-fg)]">
                Max documents per reply
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
                  How many top-scoring docs can enter the prompt (1–10)
                </span>
              </label>
              <label className="block text-sm text-[var(--admin-fg)]">
                Max characters injected
                <input
                  type="number"
                  min={500}
                  max={12000}
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
                  Total context budget for knowledge text (500–12000)
                </span>
              </label>
            </div>

            <AdminHint>
              Starter content is based on{" "}
              <a
                href="https://sinam.net"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline underline-offset-2"
              >
                sinam.net
              </a>
              . “Add pack” fills missing titles only; “Replace pack” wipes the
              library first.
            </AdminHint>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveSettings()}
                className={adminBtnPrimary}
              >
                {isSaving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed(false)}
                className={adminBtnGhost}
              >
                Add SINAM pack
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSeed(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/30 px-3.5 py-2 text-sm text-[var(--status-warn-fg)] transition hover:bg-amber-500/10 disabled:opacity-60"
              >
                Replace pack
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
                  {editingId ? "Edit knowledge entry" : "Add knowledge entry"}
                </h3>
                <p className="text-xs text-[var(--admin-muted)]">
                  Facts the model can pull into answers
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-sm text-[var(--admin-fg)]">
                  Title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className={adminFieldClass}
                    placeholder="e.g. HR leave policy"
                    autoFocus
                  />
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  Category
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
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm text-[var(--admin-fg)]">
                Content
                <textarea
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  rows={9}
                  className={`${adminFieldClass} resize-y`}
                  placeholder="Facts the model should know…"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
                <label className="block text-sm text-[var(--admin-fg)]">
                  Tags
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({ ...form, tags: e.target.value })
                    }
                    className={adminFieldClass}
                    placeholder="sinam, hr, leave"
                  />
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  Project
                  <select
                    value={form.project_id}
                    onChange={(e) =>
                      setForm({ ...form, project_id: e.target.value })
                    }
                    className={adminFieldClass}
                  >
                    <option value="">All chats (global)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[var(--admin-fg)]">
                  Priority
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
                  Always include (on company questions)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(e) =>
                      setForm({ ...form, is_enabled: e.target.checked })
                    }
                  />
                  Enabled
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-4 py-3 backdrop-blur">
              <button type="button" onClick={closeModal} className={adminBtnGhost}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveDoc()}
                className={adminBtnPrimary}
              >
                <Plus size={14} />
                {isSaving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add entry"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
