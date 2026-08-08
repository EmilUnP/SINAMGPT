"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { GuardrailsConfig } from "@/lib/guardrails";

type Props = {
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

export const AdminGuardrailsPanel = ({ onNotice, onError }: Props) => {
  const [draft, setDraft] = useState<GuardrailsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/guardrails");
      const data = (await res.json()) as {
        guardrails?: GuardrailsConfig;
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || "Failed to load guardrails");
        return;
      }
      if (data.guardrails) setDraft(data.guardrails);
    } catch {
      onError("Network error loading guardrails");
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <K extends keyof GuardrailsConfig>(
    key: K,
    value: GuardrailsConfig[K],
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/guardrails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as {
        guardrails?: GuardrailsConfig;
        error?: string;
      };
      if (!res.ok) {
        onError(data.error || "Could not save guardrails");
        return;
      }
      if (data.guardrails) setDraft(data.guardrails);
      onNotice("Guardrails saved. New chats will use these rules.");
    } catch {
      onError("Network error saving guardrails");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset guardrails to the default company rules?")) {
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
        onError(data.error || "Could not reset");
        return;
      }
      if (data.guardrails) setDraft(data.guardrails);
      onNotice("Guardrails reset to defaults");
    } catch {
      onError("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !draft) {
    return (
      <section className="animate-fade-up rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 px-4 py-10 text-center text-sm text-sky-200/50">
        Loading guardrails…
      </section>
    );
  }

  return (
    <section className="animate-fade-up overflow-hidden rounded-2xl border border-sky-400/12 bg-[#0c1424]/80 backdrop-blur-md">
      <div className="border-b border-sky-400/10 px-4 py-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-sky-400" />
          <h2 className="text-sm font-semibold">AI guardrails</h2>
        </div>
        <p className="mt-1 text-xs text-sky-200/45">
          Control what SINAMGPT can say, what it must refuse, and hard keyword
          blocks. Works across languages (EN / AZ / RU / TR+): the model replies
          in the user&apos;s language, and safety rules still apply.
        </p>
      </div>

      <div className="space-y-5 px-4 py-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["enabled", "Guardrails on", "Master switch for all rules"],
              ["applyToGuests", "Apply to guests", "Home page try-chat"],
              ["applyToUsers", "Apply to logged-in", "Saved /chat users"],
            ] as const
          ).map(([key, label, hint]) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-400/12 bg-sky-500/[0.04] px-3 py-3"
            >
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => update(key, e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-sky-50">
                  {label}
                </span>
                <span className="block text-xs text-sky-200/45">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="block text-sm text-sky-100/80">
          Persona / how it should behave
          <textarea
            value={draft.persona}
            onChange={(e) => update("persona", e.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
            placeholder="You are SINAMGPT…"
          />
        </label>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-sky-100/80">
            What it CAN help with
            <textarea
              value={draft.allowedTopics}
              onChange={(e) => update("allowedTopics", e.target.value)}
              rows={5}
              className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
              placeholder="Work writing, summaries, coding help…"
            />
          </label>

          <label className="block text-sm text-sky-100/80">
            What it MUST refuse
            <textarea
              value={draft.blockedTopics}
              onChange={(e) => update("blockedTopics", e.target.value)}
              rows={5}
              className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
              placeholder="Illegal activity, hate, scams…"
            />
          </label>
        </div>

        <label className="block text-sm text-sky-100/80">
          Hard blocked keywords / phrases
          <textarea
            value={draft.blockedKeywords}
            onChange={(e) => update("blockedKeywords", e.target.value)}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
            placeholder={"one phrase per line\nhow to make a bomb"}
          />
          <span className="mt-1.5 block text-xs text-sky-200/40">
            One phrase per line (any language). Built-in EN/AZ/RU/TR safety
            phrases are always applied too. Matching covers variants
            (make/made/bomba/бомба). Prefer short strong terms.
          </span>
        </label>

        <label className="block text-sm text-sky-100/80">
          Refusal message (hard block)
          <textarea
            value={draft.refusalMessage}
            onChange={(e) => update("refusalMessage", e.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
          />
        </label>

        <label className="block text-sm text-sky-100/80">
          Extra rules
          <textarea
            value={draft.extraRules}
            onChange={(e) => update("extraRules", e.target.value)}
            rows={4}
            className="mt-1.5 w-full resize-y rounded-xl border border-sky-400/15 bg-[#071018]/70 px-3 py-2.5 text-sm outline-none focus:border-sky-400/40 focus:ring-4 focus:ring-sky-500/15"
            placeholder="Prefer short answers. Don’t invent company policy…"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-sky-400/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleReset()}
          className="rounded-xl border border-sky-400/15 px-4 py-2.5 text-sm text-sky-100/80 transition hover:bg-sky-500/10 disabled:opacity-60"
        >
          Reset to defaults
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleSave()}
          className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.3)] transition hover:from-blue-500 hover:to-sky-400 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save guardrails"}
        </button>
      </div>
    </section>
  );
};
