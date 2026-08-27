import { useCallback, useState } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { Conversation, Project } from "@/lib/types";

type Translate = ReturnType<typeof useLocale>["t"];

type UseProjectsOptions = {
  t: Translate;
  confirm: ReturnType<typeof import("@/components/ConfirmDialog").useConfirm>;
  activeId: string | null;
  activeProjectId: string | null;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setError: (message: string) => void;
};

export const useProjects = ({
  t,
  confirm,
  activeId,
  activeProjectId,
  setActiveProjectId,
  setConversations,
  setError,
}: UseProjectsOptions) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectLimit, setProjectLimit] = useState(5);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const data = (await res.json()) as {
      projects?: Project[];
      limit?: number;
    };
    setProjects(data.projects ?? []);
    if (typeof data.limit === "number") setProjectLimit(data.limit);
  }, []);

  const selectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    setShowNewProject(false);
    setRenamingProjectId(null);
  };

  const toggleNewProject = () => {
    if (projects.length >= projectLimit) {
      setError(t("chat.projectLimitError", { limit: projectLimit }));
      return;
    }
    setRenamingProjectId(null);
    setShowNewProject((current) => !current);
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    if (projects.length >= projectLimit) {
      setError(t("chat.projectLimitCreate", { limit: projectLimit }));
      return;
    }
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { project?: Project; error?: string };
    if (!res.ok || !data.project) {
      setError(data.error || t("chat.couldNotCreateProject"));
      return;
    }
    setProjects((current) =>
      [...current, data.project!].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    setNewProjectName("");
    setShowNewProject(false);
    setActiveProjectId(data.project.id);
  };

  const startRenameProject = (project: Project) => {
    setShowNewProject(false);
    setRenamingProjectId(project.id);
    setRenameDraft(project.name);
    setActiveProjectId(project.id);
  };

  const saveRenameProject = async () => {
    if (!renamingProjectId) return;
    const name = renameDraft.trim();
    if (!name) {
      setError(t("chat.projectNameRequired"));
      return;
    }
    const res = await fetch(`/api/projects/${renamingProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { project?: Project; error?: string };
    if (!res.ok || !data.project) {
      setError(data.error || t("chat.couldNotRenameProject"));
      return;
    }
    setProjects((current) =>
      current
        .map((project) =>
          project.id === data.project!.id ? data.project! : project,
        )
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    );
    setRenamingProjectId(null);
    setRenameDraft("");
  };

  const deleteProject = async (project: Project) => {
    const ok = await confirm({
      title: t("chat.deleteProjectTitle"),
      description: t("chat.deleteProjectConfirm", { name: project.name }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || t("chat.couldNotDeleteProject"));
      return;
    }
    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (renamingProjectId === project.id) {
      setRenamingProjectId(null);
      setRenameDraft("");
    }
    if (activeProjectId === project.id) setActiveProjectId(null);
  };

  const moveChat = async (projectId: string | null) => {
    if (!activeId) return;
    const res = await fetch(`/api/conversations/${activeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) {
      setError(t("chat.couldNotMoveChat"));
      return;
    }
    const data = (await res.json()) as { conversation?: Conversation };
    if (!data.conversation) return;
    const moved = data.conversation;
    setConversations((current) => {
      if (activeProjectId && moved.project_id !== activeProjectId) {
        return current.filter((chat) => chat.id !== moved.id);
      }
      return current.map((chat) => (chat.id === moved.id ? moved : chat));
    });
  };

  return {
    projects,
    projectLimit,
    activeProjectId,
    newProjectName,
    setNewProjectName,
    showNewProject,
    setShowNewProject,
    renamingProjectId,
    setRenamingProjectId,
    renameDraft,
    setRenameDraft,
    loadProjects,
    selectProject,
    toggleNewProject,
    createProject,
    startRenameProject,
    saveRenameProject,
    deleteProject,
    moveChat,
    activeProjectName: activeProjectId
      ? projects.find((project) => project.id === activeProjectId)?.name ?? null
      : null,
  };
};
