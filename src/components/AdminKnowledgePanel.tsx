"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  KnowledgeCategory,
  KnowledgeDoc,
  KnowledgeSettings,
} from "@/lib/knowledge";

type Props = {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

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
  priority: 50,
  always_include: false,
  is_enabled: true,
};

export const AdminKnowledgePanel = ({ onNotice, onError }: Props) => {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [settings, setSettings] = useState<KnowledgeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    10,
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/knowledge");
      const data = (await res.json()) as {
        docs?: KnowledgeDoc[];
        settings?: KnowledgeSettings;
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || "Failed to load knowledge");
        return;
      }
      setDocs(data.docs ?? []);
      setSettings(data.settings ?? null);
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

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((doc) => {
      if (filter === "enabled" && doc.is_enabled !== 1) return false;
      if (filter === "disabled" && doc.is_enabled === 1) return false;
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q) ||
        doc.tags.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
      );
    });
  }, [docs, query, filter]);

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
  }, [query, filter, pageSize]);

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
      priority: doc.priority,
      always_include: doc.always_include === 1,
      is_enabled: doc.is_enabled === 1,
    });
    setModalOpen(true);
  };

  const handleSaveDoc = async () => {
    if (!form.title.trim() || form.content.trim().length < 10) {
      onError("Title and content (min 10 chars) are required");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/admin/knowledge/${editingId}` : "/api/admin/knowledge",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
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
    } catch {
      onError("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="animate-fade-up rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 px-4 py-10 text-center text-sm text-sky-200/50">
        Loading company knowledge…
      </section>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <section className="overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-sky-400" />
              <h2 className="text-sm font-semibold">Company Knowledge</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-sky-200/45">
              Local facts injected into chat context (RAG-lite). Retrieval works
              across languages; the model answers in the user&apos;s language.
              Starter pack from{" "}
              <a
                href="https://sinam.net"
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 underline underline-offset-2"
              >
                sinam.net
              </a>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3.5 py-2 text-sm font-semibold text-white"
          >
            <Plus size={14} />
            Add entry
          </button>
        </div>

        {settings ? (
          <div className="flex flex-wrap items-end gap-3 border-b border-sky-400/10 px-4 py-3">
            {(
              [
                ["enabled", "On"],
                ["applyToGuests", "Guests"],
                ["applyToUsers", "Users"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-400/12 bg-sky-500/[0.04] px-2.5 py-1.5 text-xs text-sky-100/85"
              >
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings({ ...settings, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-sky-200/55">
              Max docs
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
                className="w-14 rounded-lg border border-sky-400/15 bg-[#071018]/70 px-2 py-1.5 text-sm text-sky-100 outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-sky-200/55">
              Max chars
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
                className="w-20 rounded-lg border border-sky-400/15 bg-[#071018]/70 px-2 py-1.5 text-sm text-sky-100 outline-none"
              />
            </label>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSaveSettings()}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            >
              Save settings
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSeed(false)}
              className="rounded-lg border border-sky-400/15 px-3 py-1.5 text-xs text-sky-100/80 hover:bg-sky-500/10"
            >
              Add SINAM pack
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSeed(true)}
              className="rounded-lg border border-amber-400/20 px-3 py-1.5 text-xs text-amber-100/80 hover:bg-amber-500/10"
            >
              Replace pack
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              Library ({filteredDocs.length}
              {filteredDocs.length !== docs.length ? ` / ${docs.length}` : ""})
            </h3>
            <p className="text-xs text-sky-200/40">
              {filteredDocs.length
                ? `Showing ${rangeStart}–${rangeEnd} · click Edit to change`
                : "Full list · click Edit to change an entry"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-200/40"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, tags, content"
                className="w-52 rounded-lg border border-sky-400/15 bg-[#071018]/70 py-1.5 pl-8 pr-2.5 text-sm outline-none placeholder:text-sky-200/30 focus:border-sky-400/40"
              />
            </div>
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "enabled" | "disabled")
              }
              className="rounded-lg border border-sky-400/15 bg-[#071018]/70 px-2.5 py-1.5 text-sm outline-none"
            >
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-sky-200/55">
              Rows
              <select
                value={pageSize}
                onChange={(e) =>
                  setPageSize(
                    Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                  )
                }
                className="rounded-lg border border-sky-400/15 bg-[#071018]/70 px-2 py-1.5 text-sm outline-none"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
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
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
                <th className="min-w-[240px] px-4 py-2.5 font-medium">
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
                    colSpan={7}
                    className="px-4 py-10 text-center text-sky-200/45"
                  >
                    {docs.length === 0
                      ? "No docs yet. Add an entry or seed the SINAM pack."
                      : "No entries match this search/filter."}
                  </td>
                </tr>
              ) : (
                pagedDocs.map((doc) => (
                  <tr key={doc.id} className="border-t border-sky-400/10">
                    <td className="px-4 py-2.5">
                      <p className="max-w-[200px] truncate font-medium">
                        {doc.title}
                      </p>
                      {doc.tags ? (
                        <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-sky-200/35">
                          {doc.tags}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-sky-200/60">
                      {doc.category}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-sky-200/60">
                      {doc.priority}
                    </td>
                    <td className="px-4 py-2.5">
                      {doc.always_include === 1 ? (
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-200">
                          always
                        </span>
                      ) : (
                        <span className="text-[11px] text-sky-200/30">—</span>
                      )}
                    </td>
                    <td className="max-w-[320px] px-4 py-2.5">
                      <p className="line-clamp-2 text-xs text-sky-200/50">
                        {doc.content}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          doc.is_enabled === 1
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {doc.is_enabled === 1 ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(doc)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-sky-100 hover:bg-sky-500/10"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggle(doc)}
                          className="rounded-lg px-2 py-1 text-xs text-sky-200/70 hover:bg-sky-500/10"
                        >
                          {doc.is_enabled === 1 ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(doc)}
                          className="rounded-lg p-1 text-red-300/80 hover:bg-red-500/10"
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-400/10 px-4 py-3">
          <p className="text-xs text-sky-200/45">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/15 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>

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
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-sky-400/15 bg-[#0c1424] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sky-400/10 bg-[#0c1424]/95 px-4 py-3 backdrop-blur">
              <div>
                <h3
                  id="knowledge-modal-title"
                  className="text-sm font-semibold"
                >
                  {editingId ? "Edit knowledge entry" : "Add knowledge entry"}
                </h3>
                <p className="text-xs text-sky-200/45">
                  Facts the model can pull into answers
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-sky-200/60 transition hover:bg-sky-500/10 hover:text-sky-100"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <label className="block text-sm text-sky-100/80">
                  Title
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none focus:border-sky-400/40"
                    placeholder="e.g. HR leave policy"
                    autoFocus
                  />
                </label>
                <label className="block text-sm text-sky-100/80">
                  Category
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        category: e.target.value as KnowledgeCategory,
                      })
                    }
                    className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm text-sky-100/80">
                Content
                <textarea
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                  rows={9}
                  className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 text-sm outline-none focus:border-sky-400/40"
                  placeholder="Facts the model should know…"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <label className="block text-sm text-sky-100/80">
                  Tags
                  <input
                    value={form.tags}
                    onChange={(e) =>
                      setForm({ ...form, tags: e.target.value })
                    }
                    className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none"
                    placeholder="sinam, hr, leave"
                  />
                </label>
                <label className="block text-sm text-sky-100/80">
                  Priority
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2 outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-sky-100/80">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.always_include}
                    onChange={(e) =>
                      setForm({ ...form, always_include: e.target.checked })
                    }
                  />
                  Always include
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

            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-sky-400/10 bg-[#0c1424]/95 px-4 py-3 backdrop-blur">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-sky-400/15 px-4 py-2 text-sm text-sky-100/70 hover:bg-sky-500/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveDoc()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
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
