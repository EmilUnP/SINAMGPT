"use client";

import { useState, type ReactNode } from "react";
import {
  Bot,
  MessageSquare,
  Settings2,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import {
  AdminHint,
  AdminPageHeader,
  AdminPanelCard,
  AdminSubtabs,
  AdminToggleCard,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/AdminChrome";

export type SettingsDraft = {
  guestEnabled: boolean;
  guestDailyLimit: string;
  guestMaxMessageChars: string;
  guestHistoryLimit: string;
  registrationEnabled: boolean;
  defaultModel: string;
  fastModel: string;
  smartModel: string;
  userMaxMessageChars: string;
  userHistoryLimit: string;
  temperature: string;
  numPredict: string;
  topP: string;
};

type ModelOption = {
  name: string;
  display_name?: string | null;
  is_enabled: boolean;
};

type SettingsTab = "access" | "chat" | "generation";

type Props = {
  draft: SettingsDraft;
  onChange: (next: SettingsDraft) => void;
  models: ModelOption[];
  savedDefaultModel?: string;
  isSaving: boolean;
  onSave: () => void;
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="text-sm font-medium text-[var(--admin-fg)]">{label}</span>
    {children}
    {hint ? (
      <span className="mt-1.5 block text-xs leading-relaxed text-[var(--admin-muted)]">
        {hint}
      </span>
    ) : null}
  </label>
);

const SectionCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)]/60 p-4">
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-[var(--admin-fg)]">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--admin-muted)]">
          {description}
        </p>
      ) : null}
    </div>
    {children}
  </div>
);

export const AdminSettingsPanel = ({
  draft,
  onChange,
  models,
  savedDefaultModel,
  isSaving,
  onSave,
}: Props) => {
  const [tab, setTab] = useState<SettingsTab>("access");

  const patch = (partial: Partial<SettingsDraft>) =>
    onChange({ ...draft, ...partial });

  const modelOptions = (
    <>
      {models.map((m) => (
        <option key={m.name} value={m.name}>
          {m.display_name || m.name}
          {!m.is_enabled ? " (disabled)" : ""}
        </option>
      ))}
    </>
  );

  return (
    <AdminPanelCard>
      <div className="space-y-4 px-4 py-4">
        <AdminPageHeader
          icon={Settings2}
          title="App settings"
          description="Control guest access, registration, default models, context limits, and generation behavior for Ollama / vLLM."
          actions={
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className={adminBtnPrimary}
            >
              {isSaving ? "Saving…" : "Save settings"}
            </button>
          }
        />
        <AdminSubtabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "access", label: "Access", icon: Users },
            { id: "chat", label: "Chat & models", icon: Bot },
            { id: "generation", label: "Generation", icon: SlidersHorizontal },
          ]}
        />
      </div>

      {tab === "access" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title="Guest try-chat"
            description="Home page chat without an account. Keep limits tight for public LAN use."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,1fr))]">
              <AdminToggleCard
                emphasize
                checked={draft.guestEnabled}
                onChange={(v) => patch({ guestEnabled: v })}
                label="Guest chat enabled"
                hint="When off, the home try-chat is hidden / blocked"
              />
              <Field
                label="Daily messages"
                hint="0 = guests blocked by quota"
              >
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={draft.guestDailyLimit}
                  onChange={(e) => patch({ guestDailyLimit: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
              <Field label="Max message chars">
                <input
                  type="number"
                  min={100}
                  max={20000}
                  value={draft.guestMaxMessageChars}
                  onChange={(e) =>
                    patch({ guestMaxMessageChars: e.target.value })
                  }
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label="History turns"
                hint="Past messages sent to the model"
              >
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={draft.guestHistoryLimit}
                  onChange={(e) => patch({ guestHistoryLimit: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Accounts"
            description="Who can create a login for full chat history."
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <AdminToggleCard
                emphasize
                checked={draft.registrationEnabled}
                onChange={(v) => patch({ registrationEnabled: v })}
                label="Allow new user registration"
                hint="Turn off to freeze the user list; existing accounts still sign in"
              />
              <AdminHint>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-fg)]">
                  <UserPlus size={14} className="text-[var(--accent)]" />
                  Logged-in chat
                </span>
                <p className="mt-1">
                  Message count stays{" "}
                  <span className="font-semibold text-[var(--status-ok-fg)]">
                    unlimited
                  </span>
                  . Cap load with user max chars / history under{" "}
                  <button
                    type="button"
                    onClick={() => setTab("chat")}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    Chat & models
                  </button>
                  .
                </p>
              </AdminHint>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {tab === "chat" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title="Model presets"
            description="Default for new chats, plus Fast / Smart shortcuts in the chat header."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Default model"
                hint="Used when guest/user opens a new chat"
              >
                <select
                  value={draft.defaultModel}
                  onChange={(e) => patch({ defaultModel: e.target.value })}
                  className={adminFieldClass}
                >
                  <option value="">First enabled / env default</option>
                  {modelOptions}
                </select>
              </Field>
              <Field label="Fast model" hint="Chat “Fast” preset">
                <select
                  value={draft.fastModel}
                  onChange={(e) => patch({ fastModel: e.target.value })}
                  className={adminFieldClass}
                >
                  <option value="">Same as default</option>
                  {modelOptions}
                </select>
              </Field>
              <Field label="Smart model" hint="Chat “Smart” preset">
                <select
                  value={draft.smartModel}
                  onChange={(e) => patch({ smartModel: e.target.value })}
                  className={adminFieldClass}
                >
                  <option value="">Same as default</option>
                  {modelOptions}
                </select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Logged-in context limits"
            description="How much text and history signed-in users can send per request."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="User max message chars"
                hint="Hard cap on a single user message (500–32000)"
              >
                <input
                  type="number"
                  min={500}
                  max={32000}
                  value={draft.userMaxMessageChars}
                  onChange={(e) =>
                    patch({ userMaxMessageChars: e.target.value })
                  }
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label="User history messages"
                hint="0 = send the full conversation to the model"
              >
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={draft.userHistoryLimit}
                  onChange={(e) => patch({ userHistoryLimit: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
            </div>
          </SectionCard>

          <AdminHint>
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-fg)]">
              <MessageSquare size={14} className="text-[var(--accent)]" />
              Tip
            </span>
            <p className="mt-1">
              Enable or disable which models appear in the picker under the{" "}
              <strong className="text-[var(--admin-fg)]">Models</strong> tab —
              settings here only pick defaults among available ones.
            </p>
          </AdminHint>
        </div>
      ) : null}

      {tab === "generation" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title="Sampling"
            description="Applies to both Ollama and vLLM chat completions."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Temperature"
                hint="0 = focused · 0.7 default · 1.2+ more creative"
              >
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={draft.temperature}
                  onChange={(e) => patch({ temperature: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label="Max reply tokens"
                hint="-1 = backend default · lower = shorter / faster"
              >
                <input
                  type="number"
                  min={-1}
                  max={8192}
                  value={draft.numPredict}
                  onChange={(e) => patch({ numPredict: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label="Top-p (nucleus)"
                hint="0.9 default · lower = tighter / safer"
              >
                <input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={draft.topP}
                  onChange={(e) => patch({ topP: e.target.value })}
                  className={adminFieldClass}
                />
              </Field>
            </div>
          </SectionCard>

          <AdminHint>
            Changes apply to <strong className="text-[var(--admin-fg)]">new</strong>{" "}
            generations after you save — in-flight streams keep the old
            parameters.
          </AdminHint>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
        <p className="text-xs text-[var(--admin-muted)]">
          Saved default model:{" "}
          <span className="font-medium text-[var(--admin-fg)]">
            {savedDefaultModel || "env / first enabled"}
          </span>
        </p>
        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className={adminBtnPrimary}
        >
          {isSaving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </AdminPanelCard>
  );
};
