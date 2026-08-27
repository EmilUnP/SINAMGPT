import type { Dispatch, SetStateAction } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { User } from "@/lib/types";
import { ChatSidebar } from "./ChatSidebar";
import type { useChatModels } from "./hooks/useChatModels";
import type { useConversations } from "./hooks/useConversations";
import type { useProjects } from "./hooks/useProjects";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatSidebarContainerProps = {
  user: User;
  locale: ReturnType<typeof useLocale>["locale"];
  t: Translate;
  sidebarOpen: boolean;
  mobileSidebar: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setMobileSidebar: Dispatch<SetStateAction<boolean>>;
  conversations: ReturnType<typeof useConversations>;
  projects: ReturnType<typeof useProjects>;
  modelState: ReturnType<typeof useChatModels>;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onLogout: () => void;
};

export const ChatSidebarContainer = ({
  user,
  locale,
  t,
  sidebarOpen,
  mobileSidebar,
  setSidebarOpen,
  setMobileSidebar,
  conversations,
  projects,
  modelState,
  onNewChat,
  onOpenConversation,
  onLogout,
}: ChatSidebarContainerProps) => {
  const sidebar = (
    <ChatSidebar
      user={user}
      conversations={conversations.conversations}
      projects={projects.projects}
      projectLimit={projects.projectLimit}
      activeId={conversations.activeId}
      activeProjectId={projects.activeProjectId}
      search={conversations.search}
      isLoading={conversations.isLoadingList}
      showNewProject={projects.showNewProject}
      newProjectName={projects.newProjectName}
      renamingProjectId={projects.renamingProjectId}
      renameDraft={projects.renameDraft}
      locale={locale}
      modelLabel={modelState.modelLabel}
      onClose={() => {
        setSidebarOpen(false);
        setMobileSidebar(false);
      }}
      onNewChat={onNewChat}
      onSearchChange={conversations.setSearch}
      onSelectConversation={onOpenConversation}
      onDeleteConversation={(id) => void conversations.deleteConversation(id)}
      onTogglePin={(chat) => void conversations.togglePin(chat)}
      onSelectProject={projects.selectProject}
      onToggleNewProject={projects.toggleNewProject}
      onNewProjectNameChange={projects.setNewProjectName}
      onCreateProject={() => void projects.createProject()}
      onCancelNewProject={() => {
        projects.setShowNewProject(false);
        projects.setNewProjectName("");
      }}
      onStartRenameProject={projects.startRenameProject}
      onRenameDraftChange={projects.setRenameDraft}
      onSaveRenameProject={() => void projects.saveRenameProject()}
      onCancelRenameProject={() => {
        projects.setRenamingProjectId(null);
        projects.setRenameDraft("");
      }}
      onDeleteProject={(project) => void projects.deleteProject(project)}
      onLogout={onLogout}
      t={t}
    />
  );

  return (
    <>
      <div className="hidden md:block">{sidebarOpen ? sidebar : null}</div>
      {mobileSidebar ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label={t("chat.closeMenu")}
            onClick={() => setMobileSidebar(false)}
          />
          <div className="relative z-10 h-full max-h-dvh shadow-2xl">
            {sidebar}
          </div>
        </div>
      ) : null}
    </>
  );
};
