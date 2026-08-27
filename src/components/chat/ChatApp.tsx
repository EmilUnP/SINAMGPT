"use client";

import {
  Cable,
  FlaskConical,
  KeyRound,
  Languages,
  Paperclip,
  Shield,
  TextQuote,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";
import { useLocale } from "@/components/LocaleProvider";
import type { OverflowNavItem } from "@/components/OverflowNav";
import { autoResizeTextarea, withComposerStarter } from "@/lib/ui";
import { useIsMounted } from "@/lib/use-mounted";
import { ChatComposerContainer } from "./ChatComposerContainer";
import { ChatConversationPanel } from "./ChatConversationPanel";
import { ChatHeader } from "./ChatHeader";
import { ChatSidebarContainer } from "./ChatSidebarContainer";
import { ShareMenuPortal } from "./ShareMenuPortal";
import type { ChatAppProps } from "./chat-types";
import { useAttachmentsAndMic } from "./hooks/useAttachmentsAndMic";
import { useChatModels } from "./hooks/useChatModels";
import { useChatShare } from "./hooks/useChatShare";
import { useChatStream } from "./hooks/useChatStream";
import { useConversations } from "./hooks/useConversations";
import { useProjects } from "./hooks/useProjects";

const DEFAULT_FEATURES = {
  developerApi: false, devLab: false, fileUpload: false, fileImport: false, microphone: false,
};

export const ChatApp = ({
  user,
  features = DEFAULT_FEATURES,
}: ChatAppProps) => {
  const router = useRouter();
  const { locale, t } = useLocale();
  const confirm = useConfirm();
  const ready = useIsMounted();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modelState = useChatModels(t);
  const conversations = useConversations({
    t,
    confirm,
    activeProjectId,
    setError,
    setModel: modelState.setModel,
  });
  const projects = useProjects({
    t,
    confirm,
    activeId: conversations.activeId,
    activeProjectId,
    setActiveProjectId,
    setConversations: conversations.setConversations,
    setError,
  });

  const canAttachImages =
    modelState.supportsVision && features.fileUpload === true;
  const canImportImages =
    modelState.supportsVision && features.fileImport === true;
  const canUseMic =
    modelState.supportsAudio && features.microphone === true;
  const canListen = modelState.supportsAudio || modelState.supportsTts;
  const attachments = useAttachmentsAndMic({
    canAttachImages,
    canImportImages,
    canUseMic,
    isSending,
    setError,
    t,
  });
  const stream = useChatStream({
    activeId: conversations.activeId,
    activeProjectId,
    model: modelState.model,
    locale,
    input,
    pendingImages: attachments.pendingImages,
    pendingAudio: attachments.pendingAudio,
    isRecording: attachments.isRecording,
    lastUserMessage: conversations.lastUserMessage,
    lastAssistantMessage: conversations.lastAssistantMessage,
    editingId: conversations.editingId,
    editDraft: conversations.editDraft,
    search: conversations.search,
    isSending,
    setIsSending,
    setActiveId: conversations.setActiveId,
    setMessages: conversations.setMessages,
    setConversations: conversations.setConversations,
    setEditingId: conversations.setEditingId,
    setInput,
    setPendingImages: attachments.setPendingImages,
    setPendingAudio: attachments.setPendingAudio,
    setError,
    stopMicSession: attachments.stopMicSession,
    loadConversations: conversations.loadConversations,
    openConversation: conversations.openConversation,
    t,
  });
  const share = useChatShare({
    activeId: conversations.activeId,
    token: conversations.shareToken,
    setToken: conversations.setShareToken,
    setError,
    confirm,
    t,
  });
  const { loadConversations, setIsLoadingList } = conversations;
  const { loadModels } = modelState;
  const { loadProjects } = projects;

  useEffect(() => {
    const boot = async () => {
      try {
        setIsLoadingList(true);
        await Promise.all([
          loadConversations(),
          loadModels(),
          loadProjects(),
        ]);
      } catch (bootError) {
        setError(
          bootError instanceof Error ? bootError.message : t("chat.failedToLoad"),
        );
      } finally {
        setIsLoadingList(false);
      }
    };
    void boot();
  }, [
    loadConversations,
    loadModels,
    loadProjects,
    setIsLoadingList,
    t,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations.messages]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [input, attachments.pendingImages.length, attachments.pendingAudio]);

  useEffect(() => {
    if (!mobileSidebar) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileSidebar]);

  const extraNav = useMemo((): OverflowNavItem[] => {
    const items: OverflowNavItem[] = [];
    if (features.developerApi) {
      items.push({ href: "/developer", label: t("chat.developer"), icon: KeyRound });
    }
    if (user.role === "admin") {
      items.push(
        { href: "/admin", label: t("chat.adminPanel"), icon: Shield },
        { href: "/lab", label: t("chat.modelLab"), icon: FlaskConical },
      );
      if (features.devLab) {
        items.push({ href: "/devlab", label: t("chat.devLab"), icon: Cable });
      }
    }
    return items;
  }, [features.devLab, features.developerApi, t, user.role]);

  const applyComposerTool = (starter: string) => {
    setInput((current) => withComposerStarter(current, starter));
    requestAnimationFrame(() => {
      autoResizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    });
  };
  const composerToolSections = [
    {
      id: "uploads",
      items: [
        {
          id: "image",
          label: t("chat.attachImage"),
          hint: canAttachImages
            ? t("chat.uploadImageHint")
            : modelState.supportsVision
              ? t("chat.uploadImageNeedAdmin")
              : t("chat.uploadImageNeedVision"),
          icon: Paperclip,
          disabled: ready && (isSending || !modelState.model || !canAttachImages),
          onSelect: () => fileInputRef.current?.click(),
        },
      ],
    },
    {
      id: "write",
      items: [
        {
          id: "summarize",
          label: t("chat.toolSummarize"),
          hint: t("chat.toolSummarizeHint"),
          icon: TextQuote,
          disabled: ready && (isSending || !modelState.model),
          onSelect: () => applyComposerTool(t("chat.toolSummarizePrompt")),
        },
        {
          id: "translate",
          label: t("chat.toolTranslate"),
          hint: t("chat.toolTranslateHint"),
          icon: Languages,
          disabled: ready && (isSending || !modelState.model),
          onSelect: () => applyComposerTool(t("chat.toolTranslatePrompt")),
        },
      ],
    },
  ];

  const handleNewChat = () => {
    stream.stop();
    conversations.setActiveId(null);
    conversations.setMessages([]);
    setInput("");
    setError("");
    conversations.setEditingId(null);
    setMobileSidebar(false);
    share.setIsOpen(false);
    conversations.setShareToken(null);
    share.setIsCopied(false);
    modelState.restoreStoredModel();
    textareaRef.current?.focus();
  };

  const handleOpenConversation = async (id: string) => {
    setMobileSidebar(false);
    share.setIsOpen(false);
    share.setIsCopied(false);
    await conversations.openConversation(id);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <ChatSidebarContainer
        user={user}
        locale={locale}
        t={t}
        sidebarOpen={sidebarOpen}
        mobileSidebar={mobileSidebar}
        setSidebarOpen={setSidebarOpen}
        setMobileSidebar={setMobileSidebar}
        conversations={conversations}
        projects={projects}
        modelState={modelState}
        onNewChat={handleNewChat}
        onOpenConversation={(id) => void handleOpenConversation(id)}
        onLogout={() => void handleLogout()}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          activeConversation={conversations.activeConversation}
          activeProjectName={projects.activeProjectName}
          activeId={conversations.activeId}
          projects={projects.projects}
          sidebarOpen={sidebarOpen}
          isSending={isSending}
          shareToken={conversations.shareToken}
          shareOpen={share.isOpen}
          shareBusy={share.isBusy}
          shareButtonRef={share.buttonRef}
          extraNav={extraNav}
          onOpenMobileSidebar={() => setMobileSidebar(true)}
          onOpenSidebar={() => setSidebarOpen(true)}
          onMoveChat={(projectId) => void projects.moveChat(projectId)}
          onShareClick={() => {
            if (conversations.shareToken) share.setIsOpen((current) => !current);
            else void share.createShare(false);
          }}
          t={t}
        />
        <ShareMenuPortal
          isReady={share.isPortalReady}
          isOpen={share.isOpen}
          token={conversations.shareToken}
          url={share.url}
          isBusy={share.isBusy}
          isCopied={share.isCopied}
          position={share.position}
          menuRef={share.menuRef}
          onCopy={() => void share.copyShare()}
          onRotate={() => void share.createShare(true)}
          onRevoke={() => void share.revokeShare()}
          t={t}
        />
        <ChatConversationPanel
          username={user.username}
          error={error}
          setError={setError}
          isReady={ready}
          isSending={isSending}
          canListen={canListen}
          locale={locale}
          t={t}
          bottomRef={bottomRef}
          conversations={conversations}
          modelState={modelState}
          stream={stream}
        />
        <ChatComposerContainer
          input={input}
          setInput={setInput}
          isSending={isSending}
          isReady={ready}
          canUseMic={canUseMic}
          canAttachImages={canAttachImages}
          canImportImages={canImportImages}
          toolSections={composerToolSections}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          attachments={attachments}
          modelState={modelState}
          stream={stream}
          t={t}
        />
      </main>
    </div>
  );
};
