"use client";

import { useState } from "react";
import {
  Bot,
  MessageSquare,
  Puzzle,
  Settings2,
  SlidersHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import {
  AdminField as Field,
  AdminHint,
  AdminPageHeader,
  AdminPanelCard,
  AdminSection as SectionCard,
  AdminSubtabs,
  AdminToggleCard,
  adminBtnPrimary,
  adminFieldClass,
} from "./AdminChrome";
import { useTranslations } from "@/components/LocaleProvider";

export type SettingsDraft = {
  guestEnabled: boolean;
  guestDailyLimit: string;
  guestMaxMessageChars: string;
  guestHistoryLimit: string;
  registrationEnabled: boolean;
  defaultModel: string;
  userMaxMessageChars: string;
  userHistoryLimit: string;
  temperature: string;
  numPredict: string;
  topP: string;
  developerApiEnabled: boolean;
  devLabEnabled: boolean;
  fileUploadEnabled: boolean;
  fileImportEnabled: boolean;
  microphoneEnabled: boolean;
  webSearchEnabled: boolean;
  webSearchEngine: "duckduckgo" | "searxng";
  webSearchSearxngUrl: string;
  webSearchMaxResults: string;
  webSearchDenyHosts: string;
  webSearchDailyQuota: string;
  webSearchDefaultLocation: string;
};

type ModelOption = {
  name: string;
  display_name?: string | null;
  is_enabled: boolean;
};

type SettingsTab = "access" | "chat" | "generation" | "features";

type Props = {
  draft: SettingsDraft;
  onChange: (next: SettingsDraft) => void;
  models: ModelOption[];
  savedDefaultModel?: string;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
};

export const AdminSettingsPanel = ({
  draft,
  onChange,
  models,
  savedDefaultModel,
  isSaving,
  isDirty,
  onSave,
}: Props) => {
  const t = useTranslations();
  const [tab, setTab] = useState<SettingsTab>("access");

  const patch = (partial: Partial<SettingsDraft>) =>
    onChange({ ...draft, ...partial });

  const modelOptions = (
    <>
      {models.map((m) => (
        <option key={m.name} value={m.name}>
          {m.display_name || m.name}
          {!m.is_enabled ? t("admin.settings.modelDisabled") : ""}
        </option>
      ))}
    </>
  );

  return (
    <AdminPanelCard>
      <div className="space-y-4 px-4 py-4">
        <AdminPageHeader
          icon={Settings2}
          title={t("admin.settings.title")}
          description={t("admin.settings.description")}
          actions={
            <button
              type="button"
              disabled={isSaving}
              onClick={onSave}
              className={adminBtnPrimary}
            >
              {isSaving ? t("admin.chrome.saving") : t("admin.chrome.saveSettings")}
            </button>
          }
        />
        <AdminSubtabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "access", label: t("admin.settings.tabAccess"), icon: Users },
            { id: "chat", label: t("admin.settings.tabChat"), icon: Bot },
            {
              id: "generation",
              label: t("admin.settings.tabGeneration"),
              icon: SlidersHorizontal,
            },
            {
              id: "features",
              label: t("admin.settings.tabFeatures"),
              icon: Puzzle,
            },
          ]}
        />
      </div>

      {tab === "access" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title={t("admin.settings.guestTitle")}
            description={t("admin.settings.guestDesc")}
          >
            <AdminToggleCard
              emphasize
              checked={draft.guestEnabled}
              onChange={(v) => patch({ guestEnabled: v })}
              label={t("admin.settings.guestEnabled")}
              hint={t("admin.settings.guestEnabledHint")}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label={t("admin.settings.dailyMessages")}
                hint={t("admin.settings.dailyHint")}
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
              <Field label={t("admin.settings.maxChars")}>
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
                label={t("admin.settings.historyTurns")}
                hint={t("admin.settings.historyHint")}
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
            title={t("admin.settings.accountsTitle")}
            description={t("admin.settings.accountsDesc")}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AdminToggleCard
                emphasize
                checked={draft.registrationEnabled}
                onChange={(v) => patch({ registrationEnabled: v })}
                label={t("admin.settings.allowRegistration")}
                hint={t("admin.settings.allowRegistrationHint")}
              />
              <AdminHint>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--admin-fg)]">
                  <UserPlus size={14} className="text-[var(--accent)]" />
                  {t("admin.settings.loggedInChat")}
                </span>
                <p className="mt-1">
                  {t("admin.settings.loggedInHintBefore")}{" "}
                  <span className="font-semibold text-[var(--status-ok-fg)]">
                    {t("admin.settings.unlimited")}
                  </span>
                  {t("admin.settings.loggedInHintAfter")}{" "}
                  <button
                    type="button"
                    onClick={() => setTab("chat")}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {t("admin.settings.tabChat")}
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
            title={t("admin.settings.modelPresets")}
            description={t("admin.settings.modelPresetsDesc")}
          >
            <Field
              label={t("admin.settings.defaultModel")}
              hint={t("admin.settings.defaultModelHint")}
            >
              <select
                value={draft.defaultModel}
                onChange={(e) => patch({ defaultModel: e.target.value })}
                className={adminFieldClass}
              >
                <option value="">{t("admin.settings.firstEnabled")}</option>
                {modelOptions}
              </select>
            </Field>
          </SectionCard>

          <SectionCard
            title={t("admin.settings.contextTitle")}
            description={t("admin.settings.contextDesc")}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label={t("admin.settings.userMaxChars")}
                hint={t("admin.settings.userMaxCharsHint")}
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
                label={t("admin.settings.userHistory")}
                hint={t("admin.settings.userHistoryHint")}
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
              {t("admin.settings.tip")}
            </span>
            <p className="mt-1">
              {t("admin.settings.modelsTipBefore")}{" "}
              <strong className="text-[var(--admin-fg)]">
                {t("admin.tabs.models")}
              </strong>{" "}
              {t("admin.settings.modelsTipAfter")}
            </p>
          </AdminHint>
        </div>
      ) : null}

      {tab === "generation" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title={t("admin.settings.sampling")}
            description={t("admin.settings.samplingDesc")}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field
                label={t("admin.settings.temperature")}
                hint={t("admin.settings.temperatureHint")}
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
                label={t("admin.settings.maxTokens")}
                hint={t("admin.settings.maxTokensHint")}
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
                label={t("admin.settings.topP")}
                hint={t("admin.settings.topPHint")}
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
            {t("admin.settings.genHintBefore")}{" "}
            <strong className="text-[var(--admin-fg)]">
              {t("admin.settings.genHintStrong")}
            </strong>{" "}
            {t("admin.settings.genHintAfter")}
          </AdminHint>
        </div>
      ) : null}

      {tab === "features" ? (
        <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
          <SectionCard
            title={t("admin.settings.featuresTitle")}
            description={t("admin.settings.featuresDesc")}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AdminToggleCard
                emphasize
                checked={draft.developerApiEnabled}
                onChange={(v) => patch({ developerApiEnabled: v })}
                label={t("admin.settings.developerApi")}
                hint={t("admin.settings.developerApiHint")}
              />
              <AdminToggleCard
                emphasize
                checked={draft.devLabEnabled}
                onChange={(v) => patch({ devLabEnabled: v })}
                label={t("admin.settings.devLab")}
                hint={t("admin.settings.devLabHint")}
              />
            </div>
          </SectionCard>
          <SectionCard
            title={t("admin.settings.chatInputsTitle")}
            description={t("admin.settings.chatInputsDesc")}
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AdminToggleCard
                emphasize
                checked={draft.fileUploadEnabled}
                onChange={(v) => patch({ fileUploadEnabled: v })}
                label={t("admin.settings.fileUpload")}
                hint={t("admin.settings.fileUploadHint")}
              />
              <AdminToggleCard
                emphasize
                checked={draft.fileImportEnabled}
                onChange={(v) => patch({ fileImportEnabled: v })}
                label={t("admin.settings.fileImport")}
                hint={t("admin.settings.fileImportHint")}
              />
              <AdminToggleCard
                emphasize
                checked={draft.microphoneEnabled}
                onChange={(v) => patch({ microphoneEnabled: v })}
                label={t("admin.settings.microphone")}
                hint={t("admin.settings.microphoneHint")}
              />
            </div>
          </SectionCard>
          <SectionCard
            title={t("admin.settings.webSearchTitle")}
            description={t("admin.settings.webSearchDesc")}
          >
            <AdminToggleCard
              emphasize
              checked={draft.webSearchEnabled}
              onChange={(v) => patch({ webSearchEnabled: v })}
              label={t("admin.settings.webSearch")}
              hint={t("admin.settings.webSearchHint")}
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Field
                label={t("admin.settings.webSearchEngine")}
                hint={t("admin.settings.webSearchEngineHint")}
              >
                <select
                  value={draft.webSearchEngine}
                  onChange={(e) =>
                    patch({
                      webSearchEngine:
                        e.target.value === "searxng" ? "searxng" : "duckduckgo",
                    })
                  }
                  className={adminFieldClass}
                >
                  <option value="duckduckgo">
                    {t("admin.settings.webSearchDuckDuckGo")}
                  </option>
                  <option value="searxng">
                    {t("admin.settings.webSearchSearxng")}
                  </option>
                </select>
              </Field>
              <Field
                label={t("admin.settings.webSearchMaxResults")}
                hint={t("admin.settings.webSearchMaxResultsHint")}
              >
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.webSearchMaxResults}
                  onChange={(e) =>
                    patch({ webSearchMaxResults: e.target.value })
                  }
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label={t("admin.settings.webSearchQuota")}
                hint={t("admin.settings.webSearchQuotaHint")}
              >
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={draft.webSearchDailyQuota}
                  onChange={(e) =>
                    patch({ webSearchDailyQuota: e.target.value })
                  }
                  className={adminFieldClass}
                />
              </Field>
              <Field
                label={t("admin.settings.webSearchLocation")}
                hint={t("admin.settings.webSearchLocationHint")}
              >
                <input
                  type="text"
                  maxLength={80}
                  value={draft.webSearchDefaultLocation}
                  onChange={(e) =>
                    patch({ webSearchDefaultLocation: e.target.value })
                  }
                  placeholder="Baku, Azerbaijan"
                  className={adminFieldClass}
                />
              </Field>
              {draft.webSearchEngine === "searxng" ? (
                <Field
                  label={t("admin.settings.webSearchSearxngUrl")}
                  hint={t("admin.settings.webSearchSearxngUrlHint")}
                >
                  <input
                    type="url"
                    value={draft.webSearchSearxngUrl}
                    onChange={(e) =>
                      patch({ webSearchSearxngUrl: e.target.value })
                    }
                    placeholder="http://127.0.0.1:8080"
                    className={adminFieldClass}
                  />
                </Field>
              ) : null}
            </div>
            <Field
              label={t("admin.settings.webSearchDeny")}
              hint={t("admin.settings.webSearchDenyHint")}
            >
              <textarea
                rows={3}
                value={draft.webSearchDenyHosts}
                onChange={(e) => patch({ webSearchDenyHosts: e.target.value })}
                className={adminFieldClass}
                placeholder="example.com"
              />
            </Field>
          </SectionCard>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[var(--admin-border)] bg-[var(--admin-surface)]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="min-w-0 text-xs">
          <p
            aria-live="polite"
            className={`flex items-center gap-1.5 font-medium ${
              isDirty
                ? "text-[var(--status-warn-fg)]"
                : "text-[var(--admin-muted)]"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isDirty ? "bg-[var(--status-warn-fg)]" : "bg-[var(--status-ok-fg)]"
              }`}
            />
            {isDirty
              ? t("admin.chrome.unsavedChanges")
              : t("admin.chrome.allSaved")}
          </p>
          <p className="mt-0.5 hidden text-[var(--admin-muted)] sm:block">
            {t("admin.settings.savedDefault")}{" "}
            <span className="font-medium text-[var(--admin-fg)] [overflow-wrap:anywhere]">
              {savedDefaultModel || t("admin.settings.envFirst")}
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className={`${adminBtnPrimary} shrink-0`}
        >
          {isSaving ? t("admin.chrome.saving") : t("admin.chrome.saveSettings")}
        </button>
      </div>
    </AdminPanelCard>
  );
};
