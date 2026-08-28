import Link from "next/link";
import {
  Boxes,
  Folder,
  Infinity as InfinityIcon,
  Link2,
  Menu,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import type { RefObject } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { OverflowNav, type OverflowNavItem } from "@/components/OverflowNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { useLocale } from "@/components/LocaleProvider";
import type { Conversation, Project } from "@/lib/types";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatHeaderProps = {
  activeConversation: Conversation | null;
  activeProjectName: string | null;
  activeId: string | null;
  projects: Project[];
  sidebarOpen: boolean;
  isSending: boolean;
  shareToken: string | null;
  shareOpen: boolean;
  shareBusy: boolean;
  shareButtonRef: RefObject<HTMLButtonElement | null>;
  extraNav: OverflowNavItem[];
  onOpenMobileSidebar: () => void;
  onOpenSidebar: () => void;
  onMoveChat: (projectId: string | null) => void;
  onShareClick: () => void;
  t: Translate;
};

export const ChatHeader = ({
  activeConversation,
  activeProjectName,
  activeId,
  projects,
  sidebarOpen,
  isSending,
  shareToken,
  shareOpen,
  shareBusy,
  shareButtonRef,
  extraNav,
  onOpenMobileSidebar,
  onOpenSidebar,
  onMoveChat,
  onShareClick,
  t,
}: ChatHeaderProps) => (
  <header className="page-chrome relative z-40 flex shrink-0 flex-col gap-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 px-2.5 py-2 backdrop-blur sm:gap-2 sm:px-3 sm:py-3 md:px-5">
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
      <button
        type="button"
        className="touch-target shrink-0 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover)] md:hidden"
        onClick={onOpenMobileSidebar}
        aria-label={t("chat.openSidebar")}
      >
        <Menu size={18} />
      </button>
      {!sidebarOpen ? (
        <button
          type="button"
          className="hidden shrink-0 rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover)] md:inline-flex"
          onClick={onOpenSidebar}
          aria-label={t("chat.openSidebar")}
        >
          <PanelLeftOpen size={18} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-[var(--text)] md:text-base">
          {activeConversation?.title ?? t("chat.newChat")}
          {!activeConversation && activeProjectName ? (
            <span className="ml-1.5 font-normal text-[var(--text-muted)]">
              · {activeProjectName}
            </span>
          ) : null}
        </h1>
        <div
          className={`mt-1 flex-wrap items-center gap-1.5 ${
            activeConversation ? "flex" : "hidden min-[480px]:flex"
          }`}
        >
          <span className="chip chip-ok hidden min-[480px]:inline-flex">
            <InfinityIcon size={11} /> {t("chat.unlimited")}
          </span>
          <span className="chip chip-info hidden sm:inline-flex">
            <Sparkles size={11} /> {t("chat.historySaved")}
          </span>
          {activeConversation ? (
            <label className="chip chip-info inline-flex max-w-full items-center gap-1">
              <Folder size={11} />
              <select
                value={activeConversation.project_id ?? ""}
                onChange={(event) => onMoveChat(event.target.value || null)}
                disabled={isSending}
                className="max-w-[min(9rem,46vw)] bg-transparent text-[16px] outline-none sm:max-w-[8rem] sm:text-[11px]"
                aria-label={t("chat.moveChatAria")}
                title={t("chat.moveToProject")}
              >
                <option value="">{t("chat.noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <Link
          href="/models"
          title={t("chat.modelsGuideHint")}
          aria-label={t("chat.modelsGuide")}
          className="touch-target inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-info-border)] bg-[var(--chip-info-bg)] p-2 text-xs font-medium text-[var(--chip-info-text)] transition hover:border-[var(--accent)]/50 hover:opacity-90 sm:px-2.5 sm:py-1.5"
        >
          <Boxes size={14} />
          <span className="hidden sm:inline">{t("chat.modelsGuide")}</span>
        </Link>
        {activeId ? (
          <button
            ref={shareButtonRef}
            type="button"
            onClick={onShareClick}
            disabled={shareBusy}
            className={`touch-target inline-flex items-center gap-1.5 rounded-full border p-2 text-xs transition sm:px-2.5 sm:py-1.5 ${
              shareToken
                ? "border-[var(--accent)]/40 bg-[var(--chip-info-bg)] text-[var(--chip-info-text)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            }`}
            title={t("chat.shareWithColleagues")}
            aria-label={
              shareToken ? t("chat.manageShare") : t("chat.shareThisChat")
            }
            aria-expanded={shareOpen}
            aria-haspopup="dialog"
          >
            <Link2 size={14} />
            <span className="hidden sm:inline">
              {shareToken ? t("chat.shared") : t("chat.share")}
            </span>
          </button>
        ) : null}
        {extraNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] lg:inline-flex"
            title={label}
          >
            <Icon size={14} />
            <span className="hidden xl:inline">{label}</span>
          </Link>
        ))}
        <OverflowNav items={extraNav} className="lg:hidden" />
        <LanguageToggle size="sm" />
        <ThemeToggle size="sm" />
      </div>
    </div>
  </header>
);
