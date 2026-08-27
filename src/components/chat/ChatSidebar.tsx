import Image from "next/image";
import {
  Folder,
  FolderPlus,
  LogOut,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import type { useLocale } from "@/components/LocaleProvider";
import type { AppLocale } from "@/lib/locale";
import type { Conversation, Project, User } from "@/lib/types";
import { relativeTime } from "@/lib/ui";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatSidebarProps = {
  user: User;
  conversations: Conversation[];
  projects: Project[];
  projectLimit: number;
  activeId: string | null;
  activeProjectId: string | null;
  search: string;
  isLoading: boolean;
  showNewProject: boolean;
  newProjectName: string;
  renamingProjectId: string | null;
  renameDraft: string;
  locale: AppLocale;
  modelLabel: (name: string) => string;
  onClose: () => void;
  onNewChat: () => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin: (chat: Conversation) => void;
  onSelectProject: (id: string | null) => void;
  onToggleNewProject: () => void;
  onNewProjectNameChange: (value: string) => void;
  onCreateProject: () => void;
  onCancelNewProject: () => void;
  onStartRenameProject: (project: Project) => void;
  onRenameDraftChange: (value: string) => void;
  onSaveRenameProject: () => void;
  onCancelRenameProject: () => void;
  onDeleteProject: (project: Project) => void;
  onLogout: () => void;
  t: Translate;
};

export const ChatSidebar = ({
  user,
  conversations,
  projects,
  projectLimit,
  activeId,
  activeProjectId,
  search,
  isLoading,
  showNewProject,
  newProjectName,
  renamingProjectId,
  renameDraft,
  locale,
  modelLabel,
  onClose,
  onNewChat,
  onSearchChange,
  onSelectConversation,
  onDeleteConversation,
  onTogglePin,
  onSelectProject,
  onToggleNewProject,
  onNewProjectNameChange,
  onCreateProject,
  onCancelNewProject,
  onStartRenameProject,
  onRenameDraftChange,
  onSaveRenameProject,
  onCancelRenameProject,
  onDeleteProject,
  onLogout,
  t,
}: ChatSidebarProps) => {
  const atProjectLimit = projects.length >= projectLimit;
  return (
    <aside className="flex h-full max-h-dvh w-[min(20rem,86vw)] shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--sidebar-border)] px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            src={sinamLogo}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full"
            style={{ width: "auto", height: "auto" }}
          />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight">{t("common.brand")}</p>
            <p className="text-xs text-[var(--sidebar-muted)]">
              {t("chat.savedUnlimited")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)]"
          aria-label={t("chat.closeSidebar")}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400"
        >
          <MessageSquarePlus size={16} />
          {t("chat.newChat")}
        </button>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-3 py-2">
          <Search size={14} className="text-[var(--sidebar-muted)]" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("chat.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-muted)]"
          />
        </label>
      </div>

      <div className="border-b border-[var(--sidebar-border)] px-3 pb-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--sidebar-muted)]">
            {t("chat.projects")}
            <span className="ml-1.5 font-normal normal-case tracking-normal opacity-70">
              {projects.length}/{projectLimit}
            </span>
          </p>
          <button
            type="button"
            onClick={onToggleNewProject}
            disabled={atProjectLimit && !showNewProject}
            className="rounded-md p-1 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t("chat.newProject")}
            title={
              atProjectLimit
                ? t("chat.projectLimitReached", { limit: projectLimit })
                : t("chat.newProject")
            }
          >
            <FolderPlus size={14} />
          </button>
        </div>
        {showNewProject ? (
          <div className="mb-2 flex gap-1.5">
            <input
              value={newProjectName}
              onChange={(event) => onNewProjectNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onCreateProject();
                }
                if (event.key === "Escape") onCancelNewProject();
              }}
              placeholder={t("chat.projectNamePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-2 py-1.5 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-muted)] focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              type="button"
              onClick={onCreateProject}
              className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white"
            >
              {t("common.add")}
            </button>
          </div>
        ) : null}
        {renamingProjectId ? (
          <div className="mb-2 flex gap-1.5">
            <input
              value={renameDraft}
              onChange={(event) => onRenameDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSaveRenameProject();
                }
                if (event.key === "Escape") onCancelRenameProject();
              }}
              placeholder={t("chat.renameProjectPlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-2 py-1.5 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-muted)] focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              type="button"
              onClick={onSaveRenameProject}
              className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white"
            >
              {t("common.save")}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition ${
              activeProjectId === null
                ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-fg)] ring-1 ring-[var(--sidebar-active-ring)]"
                : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-subtle)]"
            }`}
          >
            {t("chat.allChats")}
          </button>
          {projects.map((project) => {
            const isActive = activeProjectId === project.id;
            return (
              <div
                key={project.id}
                className={`group inline-flex max-w-full items-center gap-0.5 rounded-lg text-xs transition ${
                  isActive
                    ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-fg)] ring-1 ring-[var(--sidebar-active-ring)]"
                    : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-subtle)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectProject(project.id)}
                  className="inline-flex min-w-0 items-center gap-1 px-2 py-1"
                  title={project.description || project.name}
                >
                  <Folder size={12} className="shrink-0" />
                  <span className="truncate">{project.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onStartRenameProject(project)}
                  className={`rounded-md p-1 ${
                    isActive
                      ? "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
                      : "touch-reveal opacity-0 group-hover:opacity-100"
                  } hover:bg-[var(--sidebar-hover)]`}
                  aria-label={t("chat.renameProjectAria", { name: project.name })}
                  title={t("common.rename")}
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteProject(project)}
                  className={`mr-0.5 rounded-md p-1 ${
                    isActive
                      ? "text-[var(--sidebar-muted)] hover:text-[var(--danger)]"
                      : "touch-reveal opacity-0 group-hover:opacity-100"
                  } hover:bg-[var(--sidebar-hover)] hover:text-[var(--danger)]`}
                  aria-label={t("chat.deleteProjectAria", { name: project.name })}
                  title={t("common.delete")}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-[var(--sidebar-muted)]">
            {t("chat.loadingChats")}
          </p>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-[var(--sidebar-muted)]">
              {search
                ? t("chat.noChatsSearch")
                : activeProjectId
                  ? t("chat.noChatsProject")
                  : t("chat.noChatsYet")}
            </p>
            {!search ? (
              <button
                type="button"
                onClick={onNewChat}
                className="mt-3 text-xs text-[var(--accent)] hover:underline"
              >
                {t("chat.startFirstChat")}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-1">
            {conversations.map((chat) => {
              const isActive = chat.id === activeId;
              const pinned = chat.is_pinned === 1;
              return (
                <li key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(chat.id)}
                    className={`w-full rounded-xl px-3 py-2.5 pr-16 text-left text-sm transition ${
                      isActive
                        ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-fg)] ring-1 ring-[var(--sidebar-active-ring)]"
                        : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-subtle)] hover:text-[var(--sidebar-fg)]"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {pinned ? (
                        <Pin
                          size={12}
                          className="shrink-0 text-[var(--accent)]"
                          fill="currentColor"
                        />
                      ) : null}
                      <span className="line-clamp-1 font-medium text-[var(--sidebar-fg)]">
                        {chat.title}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--sidebar-muted)]">
                      <span className="truncate">{modelLabel(chat.model)}</span>
                      <span className="shrink-0">
                        {relativeTime(chat.updated_at, locale)}
                      </span>
                    </span>
                  </button>
                  <div className="touch-reveal absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onTogglePin(chat)}
                      className="rounded-md p-1.5 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--accent)]"
                      aria-label={pinned ? t("chat.unpinChat") : t("chat.pinChat")}
                      title={pinned ? t("chat.unpin") : t("chat.pin")}
                    >
                      {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(chat.id)}
                      className="rounded-md p-1.5 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--danger)]"
                      aria-label={t("chat.deleteChat")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="safe-bottom border-t border-[var(--sidebar-border)] p-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-[var(--sidebar-fg)]">
            {user.username}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--sidebar-muted)] transition hover:bg-[var(--sidebar-subtle)] hover:text-[var(--sidebar-fg)]"
          >
            <LogOut size={14} />
            {t("chat.signOut")}
          </button>
        </div>
      </div>
    </aside>
  );
};
