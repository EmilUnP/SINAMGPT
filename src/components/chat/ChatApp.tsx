"use client";

import {
  Check,
  Boxes,
  Cable,
  ChevronDown,
  FlaskConical,
  KeyRound,
  Folder,
  FolderPlus,
  Infinity as InfinityIcon,
  Link2,
  Link2Off,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizonal,
  Square,
  Trash2,
  LogOut,
  Shield,
  Sparkles,
  Mic,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import sinamLogo from "@/assets/sinam_logo.png";
import { CopyButton } from "./CopyButton";
import { KnowledgeCitations } from "./KnowledgeCitations";
import { OverflowNav, type OverflowNavItem } from "@/components/OverflowNav";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLocale } from "@/components/LocaleProvider";
import { MarkdownMessage } from "./MarkdownMessage";
import { MessageAudio } from "./MessageAudio";
import { MessageImages } from "./MessageImages";
import { ModelPicker, type ModelOption } from "./ModelPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  fileToChatImage,
  imagePreviewUrl,
  type ChatImagePayload,
} from "@/lib/compress-image";
import { AUDIO_MIME, MAX_AUDIO_SECONDS } from "@/lib/audio-limits";
import {
  dropHasFiles,
  isDroppedAudioFile,
  isDroppedImageFile,
} from "@/lib/chat-drop";
import { attachmentUrl, MAX_CHAT_IMAGES } from "@/lib/image-limits";
import {
  ensureMicPermission,
  fileToWavClip,
  listMicDevices,
  startMicRecording,
  type MicDevice,
  type MicSession,
  type RecordedWav,
} from "@/lib/record-mic";
import { autoResizeTextarea, formatChatTime, relativeTime } from "@/lib/ui";
import { useIsMounted } from "@/lib/use-mounted";
import type {
  Conversation,
  KnowledgeCitation,
  Message,
  Project,
  User,
} from "@/lib/types";

type ChatAppProps = {
  user: User;
  features?: {
    developerApi: boolean;
    devLab: boolean;
  };
};

type PendingImage = ChatImagePayload & { id: string };

type PendingAudio = {
  mime: typeof AUDIO_MIME;
  data: string;
  name: string;
  durationMs: number;
  previewUrl: string;
};

type UiMessage = Message & {
  isStreaming?: boolean;
  localImages?: ChatImagePayload[];
  localAudio?: PendingAudio;
};

const LS_LAST_MODEL = "sinamgpt_last_model";
const LS_LAST_MIC = "sinamgpt_last_mic";

const readStoredModel = (): string => {
  try {
    return localStorage.getItem(LS_LAST_MODEL)?.trim() || "";
  } catch {
    return "";
  }
};

const persistModelChoice = (modelName: string) => {
  try {
    if (modelName) localStorage.setItem(LS_LAST_MODEL, modelName);
  } catch {
    /* ignore */
  }
};

const readStoredMic = (): string => {
  try {
    return localStorage.getItem(LS_LAST_MIC)?.trim() || "";
  } catch {
    return "";
  }
};

const persistMicChoice = (deviceId: string) => {
  try {
    if (deviceId) localStorage.setItem(LS_LAST_MIC, deviceId);
    else localStorage.removeItem(LS_LAST_MIC);
  } catch {
    /* ignore */
  }
};

const parseSseChunk = (raw: string) => {
  const lines = raw.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) };
};

export const ChatApp = ({
  user,
  features = { developerApi: false, devLab: false },
}: ChatAppProps) => {
  const router = useRouter();
  const { locale, t } = useLocale();
  const suggestions = [
    {
      title: t("chat.suggestionHello"),
      prompt: t("chat.suggestionHelloPrompt"),
    },
    {
      title: t("chat.suggestionAi"),
      prompt: t("chat.suggestionAiPrompt"),
    },
    {
      title: t("chat.suggestionTip"),
      prompt: t("chat.suggestionTipPrompt"),
    },
    {
      title: t("chat.suggestionFact"),
      prompt: t("chat.suggestionFactPrompt"),
    },
  ];
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  // Keep disabled attrs identical on SSR + first client paint (hydration-safe).
  const ready = useIsMounted();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectLimit, setProjectLimit] = useState(5);
  /** null = all chats (Inbox) */
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renameDraft, setRenameDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareMenuPos, setShareMenuPos] = useState({
    top: 0,
    right: 0,
    fullWidth: false,
  });
  const sharePortalReady = useIsMounted();

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendLockRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MicSession | null>(null);
  const micPickerRef = useRef<HTMLDivElement | null>(null);
  const micDeviceIdRef = useRef("");
  const dragDepthRef = useRef(0);
  const searchTimerRef = useRef<number | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  const updateShareMenuPos = useCallback(() => {
    const el = shareBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fullWidth = window.innerWidth < 640;
    setShareMenuPos({
      top: rect.bottom + 8,
      right: fullWidth ? 12 : Math.max(8, window.innerWidth - rect.right),
      fullWidth,
    });
  }, []);

  useLayoutEffect(() => {
    if (!shareOpen || !shareToken) return;
    updateShareMenuPos();
    const onResize = () => updateShareMenuPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [shareOpen, shareToken, updateShareMenuPos]);

  useEffect(() => {
    if (!shareOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (shareBtnRef.current?.contains(target)) return;
      if (shareMenuRef.current?.contains(target)) return;
      setShareOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setShareOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);

  useEffect(() => {
    if (!mobileSidebar) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSidebar]);

  const extraNav = useMemo((): OverflowNavItem[] => {
    const items: OverflowNavItem[] = [];
    if (features.developerApi) {
      items.push({
        href: "/developer",
        label: t("chat.developer"),
        icon: KeyRound,
      });
    }
    if (user.role === "admin") {
      items.push(
        { href: "/admin", label: t("chat.adminPanel"), icon: Shield },
        { href: "/lab", label: t("chat.modelLab"), icon: FlaskConical },
      );
      if (features.devLab) {
        items.push({
          href: "/devlab",
          label: t("chat.devLab"),
          icon: Cable,
        });
      }
    }
    return items;
  }, [t, user.role, features.developerApi, features.devLab]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }, [messages]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const modelLabel = (name: string) =>
    models.find((m) => m.name === name)?.display_name || name;

  const supportsVision = Boolean(
    models.find((m) => m.name === model)?.vision,
  );
  const supportsAudio = Boolean(
    models.find((m) => m.name === model)?.audio,
  );
  const currentMicLabel =
    micDevices.find((device) => device.deviceId === micDeviceId)?.label || "";

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [input, pendingImages.length, pendingAudio]);

  useEffect(() => {
    if (!supportsVision && pendingImages.length) setPendingImages([]);
  }, [supportsVision, pendingImages.length]);

  const clearPendingAudio = useCallback(() => {
    setPendingAudio(null);
  }, []);

  const applyRecordedClip = useCallback(
    (clip: RecordedWav): PendingAudio => {
      const next: PendingAudio = {
        mime: clip.mime,
        data: clip.data,
        name: clip.name,
        durationMs: clip.durationMs,
        previewUrl: `data:${clip.mime};base64,${clip.data}`,
      };
      setPendingAudio(next);
      if (clip.peak < 0.02) setError(t("chat.micQuiet"));
      return next;
    },
    [t],
  );

  const stopMicSession = useCallback(async (): Promise<PendingAudio | null> => {
    const session = recorderRef.current;
    recorderRef.current = null;
    if (!session) {
      setIsRecording(false);
      return pendingAudio;
    }
    setIsRecording(false);
    setIsProcessingAudio(true);
    setMicLevel(0);
    try {
      const clip = await session.stop();
      return applyRecordedClip(clip);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("chat.micFailed"),
      );
      return null;
    } finally {
      setIsProcessingAudio(false);
      setRecordElapsedMs(0);
    }
  }, [applyRecordedClip, pendingAudio, t]);

  const cancelMicSession = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIsRecording(false);
    setIsProcessingAudio(false);
    setRecordElapsedMs(0);
    setMicLevel(0);
  }, []);

  const refreshMicDevices = useCallback(async (preferred?: string) => {
    const list = await listMicDevices();
    setMicDevices(list);
    setMicDeviceId((current) => {
      const want = preferred || current || readStoredMic();
      if (want && list.some((device) => device.deviceId === want)) {
        micDeviceIdRef.current = want;
        return want;
      }
      const next = list[0]?.deviceId ?? "";
      micDeviceIdRef.current = next;
      return next;
    });
    return list;
  }, []);

  useEffect(() => {
    if (!supportsAudio) {
      setMicDevices([]);
      setMicPickerOpen(false);
      return;
    }
    void refreshMicDevices();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onChange = () => {
      void refreshMicDevices();
    };
    media.addEventListener("devicechange", onChange);
    return () => media.removeEventListener("devicechange", onChange);
  }, [supportsAudio, refreshMicDevices]);

  useEffect(() => {
    if (!micPickerOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (micPickerRef.current?.contains(target)) return;
      setMicPickerOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMicPickerOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [micPickerOpen]);

  useEffect(() => {
    micDeviceIdRef.current = micDeviceId;
  }, [micDeviceId]);

  useEffect(() => {
    if (supportsAudio) return;
    cancelMicSession();
    if (pendingAudio) clearPendingAudio();
  }, [supportsAudio, pendingAudio, cancelMicSession, clearPendingAudio]);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
    },
    [],
  );

  const loadConversations = useCallback(
    async (query?: string, projectId?: string | null) => {
      const q = (query ?? "").trim();
      const pid = projectId === undefined ? activeProjectId : projectId;
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (pid) params.set("projectId", pid);
      const qs = params.toString();
      const res = await fetch(
        qs ? `/api/conversations?${qs}` : "/api/conversations",
      );
      if (!res.ok) throw new Error(t("chat.failedLoadChats"));
      const data = (await res.json()) as { conversations: Conversation[] };
      setConversations(data.conversations);
      return data.conversations;
    },
    [activeProjectId, t],
  );

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

  const loadModels = useCallback(async () => {
    const res = await fetch("/api/models");
    const data = (await res.json()) as {
      models?: ModelOption[];
      defaultModel?: string;
      error?: string;
    };

    if (!res.ok) {
      setModelsError(data.error || t("chat.ollamaUnavailable"));
      setModels([]);
      return;
    }

    const list = data.models ?? [];
    const names = new Set(list.map((m) => m.name));
    const fallback = data.defaultModel || list[0]?.name || "";
    setModels(list);
    setModelsError("");

    setModel((current) => {
      if (current && names.has(current)) return current;
      const storedModel = readStoredModel();
      if (storedModel && names.has(storedModel)) return storedModel;
      return fallback;
    });
  }, [t]);

  const handleModelSelect = (name: string) => {
    setModel(name);
    persistModelChoice(name);
  };

  const imageErrorMessage = (code: "type" | "size" | "failed") => {
    if (code === "type") return t("chat.imageType");
    if (code === "size") return t("chat.imageTooLarge");
    return t("chat.imageFailed");
  };

  const addImageFiles = async (files: File[]) => {
    if (!supportsVision || !files.length) return;
    const remaining = MAX_CHAT_IMAGES - pendingImages.length;
    if (remaining <= 0) {
      setError(t("chat.imageLimit", { n: MAX_CHAT_IMAGES }));
      return;
    }
    const slice = files.slice(0, remaining);
    const next: PendingImage[] = [];
    for (const file of slice) {
      const result = await fileToChatImage(file);
      if (!result.ok) {
        setError(imageErrorMessage(result.code));
        continue;
      }
      next.push({ ...result.image, id: `img-${Date.now()}-${Math.random()}` });
    }
    if (next.length) {
      setPendingImages((prev) => [...prev, ...next].slice(0, MAX_CHAT_IMAGES));
      setError("");
    }
  };

  const addAudioFile = async (file: File) => {
    if (!supportsAudio) {
      setError(t("chat.audioRequired"));
      return;
    }
    if (isRecording) cancelMicSession();
    setIsProcessingAudio(true);
    try {
      const clip = await fileToWavClip(file);
      applyRecordedClip(clip);
      setError("");
    } catch (err) {
      if (err instanceof Error && err.message === "too-large") {
        setError(t("chat.audioTooLarge"));
      } else {
        setError(t("chat.audioFileFailed"));
      }
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const addDroppedFiles = async (files: File[]) => {
    if (!files.length || isSending) return;
    const images = files.filter(isDroppedImageFile);
    const audios = files.filter(isDroppedAudioFile);
    const unsupported = files.filter(
      (file) => !isDroppedImageFile(file) && !isDroppedAudioFile(file),
    );

    if (!images.length && !audios.length) {
      setError(t("chat.dropUnsupported"));
      return;
    }

    let warning = "";
    if (unsupported.length) warning = t("chat.dropUnsupported");
    if (images.length) {
      if (supportsVision) await addImageFiles(images);
      else warning = t("chat.visionRequired");
    }
    if (audios.length) {
      if (supportsAudio) {
        await addAudioFile(audios[0]);
        if (audios.length > 1) warning = t("chat.audioLimit");
      } else warning = t("chat.audioRequired");
    }
    if (warning) setError(warning);
  };

  const canDropFiles = supportsVision || supportsAudio;

  const handleComposerDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    if (canDropFiles) setIsDraggingOver(true);
  };

  const handleComposerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canDropFiles ? "copy" : "none";
  };

  const handleComposerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!dropHasFiles(event.dataTransfer.types)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingOver(false);
  };

  const handleComposerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
    const files = Array.from(event.dataTransfer.files);
    void addDroppedFiles(files);
  };

  const micErrorMessage = (err: unknown) => {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return t("chat.micDenied");
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return t("chat.micSwitchFailed");
    }
    if (err instanceof Error && err.message) return err.message;
    return t("chat.micFailed");
  };

  const handleToggleMic = async () => {
    if (!supportsAudio || isSending) return;
    if (isProcessingAudio) return;
    if (isRecording) {
      await stopMicSession();
      return;
    }
    try {
      setError("");
      setRecordElapsedMs(0);
      setMicLevel(0);
      setMicPickerOpen(false);
      const chosenId = micDeviceIdRef.current || micDeviceId || undefined;
      const session = await startMicRecording({
        deviceId: chosenId,
        onTick: (elapsedMs, level) => {
          setRecordElapsedMs(elapsedMs);
          setMicLevel(level);
        },
        onAutoStop: (clip) => {
          recorderRef.current = null;
          setIsRecording(false);
          setMicLevel(0);
          applyRecordedClip(clip);
          setRecordElapsedMs(0);
        },
      });
      recorderRef.current = session;
      setIsRecording(true);
      void refreshMicDevices(chosenId);
    } catch (err) {
      setError(micErrorMessage(err));
    }
  };

  const handleOpenMicPicker = async () => {
    if (isRecording || isSending || isProcessingAudio) return;
    if (micPickerOpen) {
      setMicPickerOpen(false);
      return;
    }
    try {
      setError("");
      await ensureMicPermission(micDeviceIdRef.current || micDeviceId);
      await refreshMicDevices(micDeviceId);
      setMicPickerOpen(true);
    } catch (err) {
      setError(micErrorMessage(err));
    }
  };

  const handleSelectMic = (deviceId: string) => {
    micDeviceIdRef.current = deviceId;
    setMicDeviceId(deviceId);
    persistMicChoice(deviceId);
    setMicPickerOpen(false);
  };

  useEffect(() => {
    const boot = async () => {
      try {
        setIsLoadingList(true);
        await Promise.all([loadConversations(), loadModels(), loadProjects()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("chat.failedToLoad"));
      } finally {
        setIsLoadingList(false);
      }
    };
    void boot();
  }, [loadConversations, loadModels, loadProjects, t]);

  useEffect(() => {
    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = window.setTimeout(() => {
      void loadConversations(search, activeProjectId).catch(() => undefined);
    }, 250);
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [search, activeProjectId, loadConversations]);

  const openConversation = async (id: string) => {
    setError("");
    setEditingId(null);
    setActiveId(id);
    setMobileSidebar(false);
    setShareOpen(false);
    setShareCopied(false);

    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) {
      setError(t("chat.couldNotOpen"));
      return;
    }

    const data = (await res.json()) as {
      conversation: Conversation;
      messages: Message[];
    };

    setMessages(data.messages);
    const chatModel = data.conversation.model;
    setModel(chatModel);
    setShareToken(data.conversation.share_token ?? null);
  };

  const handleNewChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError("");
    setEditingId(null);
    setMobileSidebar(false);
    setShareOpen(false);
    setShareToken(null);
    setShareCopied(false);
    const stored = readStoredModel();
    if (stored && models.some((m) => m.name === stored)) {
      setModel(stored);
    }
    textareaRef.current?.focus();
  };

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}`
    : "";

  const handleCreateShare = async (rotate = false) => {
    if (!activeId) return;
    if (rotate && shareToken) {
      const ok = window.confirm(t("chat.shareConfirmNew"));
      if (!ok) return;
    }
    setShareBusy(true);
    setShareCopied(false);
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        share_token?: string;
        error?: string;
      };
      if (!res.ok || !data.share_token) {
        setError(data.error || t("chat.couldNotCreateShare"));
        return;
      }
      setShareToken(data.share_token);
      setShareOpen(true);
    } catch {
      setError(t("chat.couldNotCreateShare"));
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!activeId) return;
    setShareBusy(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(t("chat.couldNotRevokeShare"));
        return;
      }
      setShareToken(null);
      setShareCopied(false);
      setShareOpen(false);
    } catch {
      setError(t("chat.couldNotRevokeShare"));
    } finally {
      setShareBusy(false);
    }
  };

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setError(t("chat.couldNotCopyLink"));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t("chat.couldNotDeleteChat"));
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setEditingId(null);
    }
  };

  const handleTogglePin = async (chat: Conversation) => {
    const nextPinned = chat.is_pinned !== 1;
    const res = await fetch(`/api/conversations/${chat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: nextPinned }),
    });
    if (!res.ok) {
      setError(t("chat.couldNotUpdatePin"));
      return;
    }
    const data = (await res.json()) as { conversation?: Conversation };
    if (data.conversation) {
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === chat.id ? data.conversation! : c,
        );
        return next.sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
          return b.updated_at.localeCompare(a.updated_at);
        });
      });
    } else {
      void loadConversations(search);
    }
  };

  const handleSelectProject = (projectId: string | null) => {
    setActiveProjectId(projectId);
    setShowNewProject(false);
    setRenamingProjectId(null);
  };

  const atProjectLimit = projects.length >= projectLimit;

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    if (atProjectLimit) {
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
    setProjects((prev) =>
      [...prev, data.project!].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    setNewProjectName("");
    setShowNewProject(false);
    setActiveProjectId(data.project.id);
  };

  const handleStartRenameProject = (project: Project) => {
    setShowNewProject(false);
    setRenamingProjectId(project.id);
    setRenameDraft(project.name);
    setActiveProjectId(project.id);
  };

  const handleSaveRenameProject = async () => {
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
    setProjects((prev) =>
      prev
        .map((p) => (p.id === data.project!.id ? data.project! : p))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    );
    setRenamingProjectId(null);
    setRenameDraft("");
  };

  const handleDeleteProject = async (project: Project) => {
    if (
      !window.confirm(
        t("chat.deleteProjectConfirm", { name: project.name }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error || t("chat.couldNotDeleteProject"));
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    if (renamingProjectId === project.id) {
      setRenamingProjectId(null);
      setRenameDraft("");
    }
    if (activeProjectId === project.id) {
      setActiveProjectId(null);
    }
  };

  const handleMoveChat = async (projectId: string | null) => {
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
    if (data.conversation) {
      const moved = data.conversation;
      setConversations((prev) => {
        if (activeProjectId && moved.project_id !== activeProjectId) {
          return prev.filter((c) => c.id !== moved.id);
        }
        return prev.map((c) => (c.id === moved.id ? moved : c));
      });
    }
  };

  const activeProjectName = useMemo(() => {
    if (!activeProjectId) return null;
    return projects.find((p) => p.id === activeProjectId)?.name ?? null;
  }, [activeProjectId, projects]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const runChatRequest = async (opts: {
    body: Record<string, unknown>;
    prepareMessages: () => {
      tempUserId?: string;
      tempAssistantId: string;
    };
    restoreOnError?: string;
    restoreImagesOnError?: PendingImage[];
    restoreAudioOnError?: PendingAudio | null;
    /** After rewrite/regenerate/edit failures, reload from DB (server may have deleted the old answer). */
    reloadConversationOnError?: boolean;
  }) => {
    if (isSending) return;
    if (!model) {
      setError(t("chat.noModelSelected"));
      return;
    }

    setError("");
    setIsSending(true);
    setEditingId(null);

    const { tempUserId, tempAssistantId } = opts.prepareMessages();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(opts.body),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("chat.chatFailed"));
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let conversationId = activeId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const parsed = parseSseChunk(part);
          if (!parsed) continue;

          if (parsed.event === "meta") {
            const meta = parsed.data as {
              conversationId: string;
              conversation: Conversation;
              userMessage: Message;
              sources?: KnowledgeCitation[] | null;
            };
            conversationId = meta.conversationId;
            setActiveId(meta.conversationId);
            setConversations((prev) => {
              const others = prev.filter((c) => c.id !== meta.conversationId);
              const next = [meta.conversation, ...others];
              return next.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
                return b.updated_at.localeCompare(a.updated_at);
              });
            });
            setMessages((prev) =>
              prev.map((m) => {
                if (tempUserId && m.id === tempUserId) {
                  return { ...meta.userMessage };
                }
                if (m.id === tempAssistantId) {
                  return {
                    ...m,
                    conversation_id: meta.conversationId,
                    sources: meta.sources?.length ? meta.sources : null,
                  };
                }
                if (m.id === meta.userMessage.id) {
                  return { ...meta.userMessage };
                }
                return m;
              }),
            );
          }

          if (parsed.event === "token") {
            const token = (parsed.data as { content: string }).content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            );
          }

          if (parsed.event === "done") {
            const doneData = parsed.data as { assistantMessage: Message };
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId
                  ? { ...doneData.assistantMessage }
                  : m,
              ),
            );
            if (conversationId) {
              void loadConversations(search);
            }
          }

          if (parsed.event === "error") {
            throw new Error(
              (parsed.data as { error?: string }).error || t("chat.streamError"),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  isStreaming: false,
                  content: m.content || t("common.stopped"),
                }
              : m,
          ),
        );
      } else {
        const message =
          err instanceof Error ? err.message : t("chat.failedToSend");
        setError(message);
        if (opts.reloadConversationOnError && activeId) {
          await openConversation(activeId);
        } else {
          setMessages((prev) =>
            prev.filter(
              (m) => m.id !== tempUserId && m.id !== tempAssistantId,
            ),
          );
        }
        if (opts.restoreOnError != null) {
          setInput(opts.restoreOnError);
        }
        if (opts.restoreImagesOnError?.length) {
          setPendingImages(opts.restoreImagesOnError);
        }
        if (opts.restoreAudioOnError) {
          setPendingAudio(opts.restoreAudioOnError);
        }
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
      setMessages((prev) =>
        prev.map((m) => ({ ...m, isStreaming: false })),
      );
    }
  };

  const handleSend = async (preset?: string) => {
    if (sendLockRef.current || isSending) return;
    sendLockRef.current = true;
    try {
    let audioToSend = preset ? null : pendingAudio;
    if (!preset && isRecording) {
      audioToSend = await stopMicSession();
    }
    const text = (preset ?? input).trim();
    const imagesToSend = preset ? [] : pendingImages;
    const messageText =
      text || (audioToSend ? t("chat.audioDefaultPrompt") : "");
    if ((!messageText && imagesToSend.length === 0) || !model) return;

    setInput("");
    if (imagesToSend.length) setPendingImages([]);
    if (audioToSend) setPendingAudio(null);

    await runChatRequest({
      body: {
        conversationId: activeId ?? undefined,
        message: messageText,
        images: imagesToSend.map(({ mime, data, name }) => ({
          mime,
          data,
          name,
        })),
        audio: audioToSend
          ? {
              mime: audioToSend.mime,
              data: audioToSend.data,
              name: audioToSend.name,
            }
          : undefined,
        model,
        projectId: activeId ? undefined : activeProjectId,
        mode: "send",
      },
      restoreOnError: text,
      restoreImagesOnError: imagesToSend,
      restoreAudioOnError: audioToSend,
      prepareMessages: () => {
        const tempUserId = `temp-user-${Date.now()}`;
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempUser: UiMessage = {
          id: tempUserId,
          conversation_id: activeId ?? "pending",
          role: "user",
          content: messageText,
          created_at: new Date().toISOString(),
          localImages: imagesToSend.length ? imagesToSend : undefined,
          localAudio: audioToSend ?? undefined,
        };
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId ?? "pending",
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => [...prev, tempUser, tempAssistant]);
        return { tempUserId, tempAssistantId };
      },
    });
    } finally {
      sendLockRef.current = false;
    }
  };

  const handleRegenerate = async () => {
    if (!activeId || !lastUserMessage || isSending) return;

    await runChatRequest({
      body: {
        conversationId: activeId,
        model,
        mode: "regenerate",
      },
      reloadConversationOnError: true,
      prepareMessages: () => {
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => {
          const withoutTrailingAssistant =
            prev.length && prev[prev.length - 1].role === "assistant"
              ? prev.slice(0, -1)
              : prev;
          return [...withoutTrailingAssistant, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  const handleRewrite = async (
    style: "shorter" | "formal" | "continue",
  ) => {
    if (!activeId || !lastAssistantMessage || isSending) return;

    await runChatRequest({
      body: {
        conversationId: activeId,
        model,
        mode: "rewrite",
        rewrite: style,
      },
      reloadConversationOnError: true,
      prepareMessages: () => {
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => {
          const withoutTrailingAssistant =
            prev.length && prev[prev.length - 1].role === "assistant"
              ? prev.slice(0, -1)
              : prev;
          return [...withoutTrailingAssistant, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  const handleStartEdit = (message: UiMessage) => {
    if (isSending) return;
    setEditingId(message.id);
    setEditDraft(message.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleSaveEdit = async () => {
    const text = editDraft.trim();
    if (!text || !editingId || !activeId) return;

    const editMessageId = editingId;

    await runChatRequest({
      body: {
        conversationId: activeId,
        message: text,
        model,
        mode: "edit",
        editMessageId,
      },
      reloadConversationOnError: true,
      prepareMessages: () => {
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        const tempAssistant: UiMessage = {
          id: tempAssistantId,
          conversation_id: activeId,
          role: "assistant",
          content: "",
          created_at: new Date().toISOString(),
          isStreaming: true,
        };
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === editMessageId);
          if (idx < 0) return prev;
          const kept = prev.slice(0, idx + 1).map((m) =>
            m.id === editMessageId ? { ...m, content: text } : m,
          );
          return [...kept, tempAssistant];
        });
        return { tempAssistantId };
      },
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const Sidebar = (
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
          onClick={() => {
            setSidebarOpen(false);
            setMobileSidebar(false);
          }}
          className="rounded-lg p-2 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-fg)]"
          aria-label={t("chat.closeSidebar")}
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400"
        >
          <MessageSquarePlus size={16} />
          {t("chat.newChat")}
        </button>

        <label className="flex items-center gap-2 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-3 py-2">
          <Search size={14} className="text-[var(--sidebar-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            onClick={() => {
              if (atProjectLimit) {
                setError(
                  t("chat.projectLimitError", { limit: projectLimit }),
                );
                return;
              }
              setRenamingProjectId(null);
              setShowNewProject((v) => !v);
            }}
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
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateProject();
                }
                if (e.key === "Escape") {
                  setShowNewProject(false);
                  setNewProjectName("");
                }
              }}
              placeholder={t("chat.projectNamePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-2 py-1.5 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-muted)] focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleCreateProject()}
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
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSaveRenameProject();
                }
                if (e.key === "Escape") {
                  setRenamingProjectId(null);
                  setRenameDraft("");
                }
              }}
              placeholder={t("chat.renameProjectPlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-subtle)] px-2 py-1.5 text-sm text-[var(--sidebar-fg)] outline-none placeholder:text-[var(--sidebar-muted)] focus:border-[var(--accent)]"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void handleSaveRenameProject()}
              className="rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white"
            >
              {t("common.save")}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleSelectProject(null)}
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
                  onClick={() => handleSelectProject(project.id)}
                  className="inline-flex min-w-0 items-center gap-1 px-2 py-1"
                  title={project.description || project.name}
                >
                  <Folder size={12} className="shrink-0" />
                  <span className="truncate">{project.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartRenameProject(project)}
                  className={`rounded-md p-1 ${
                    isActive
                      ? "text-[var(--sidebar-muted)] hover:text-[var(--sidebar-fg)]"
                      : "opacity-0 group-hover:opacity-100 touch-reveal"
                  } hover:bg-[var(--sidebar-hover)]`}
                  aria-label={t("chat.renameProjectAria", { name: project.name })}
                  title={t("common.rename")}
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteProject(project)}
                  className={`mr-0.5 rounded-md p-1 ${
                    isActive
                      ? "text-[var(--sidebar-muted)] hover:text-[var(--danger)]"
                      : "opacity-0 group-hover:opacity-100 touch-reveal"
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
        {isLoadingList ? (
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
                onClick={handleNewChat}
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
                    onClick={() => void openConversation(chat.id)}
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
                      onClick={() => void handleTogglePin(chat)}
                      className="rounded-md p-1.5 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--accent)]"
                      aria-label={pinned ? t("chat.unpinChat") : t("chat.pinChat")}
                      title={pinned ? t("chat.unpin") : t("chat.pin")}
                    >
                      {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chat.id)}
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
            onClick={() => void handleLogout()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--sidebar-muted)] transition hover:bg-[var(--sidebar-subtle)] hover:text-[var(--sidebar-fg)]"
          >
            <LogOut size={14} />
            {t("chat.signOut")}
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <div className="hidden md:block">{sidebarOpen ? Sidebar : null}</div>

      {mobileSidebar ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label={t("chat.closeMenu")}
            onClick={() => setMobileSidebar(false)}
          />
          <div className="relative z-10 h-full max-h-dvh shadow-2xl">{Sidebar}</div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="page-chrome relative z-40 flex shrink-0 flex-col gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-2.5 backdrop-blur sm:py-3 md:px-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="touch-target rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover)] md:hidden"
              onClick={() => setMobileSidebar(true)}
              aria-label={t("chat.openSidebar")}
            >
              <Menu size={18} />
            </button>

            {!sidebarOpen ? (
              <button
                type="button"
                className="hidden rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--hover)] md:inline-flex"
                onClick={() => setSidebarOpen(true)}
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
              <div className="mt-1 hidden flex-wrap items-center gap-1.5 min-[400px]:flex">
                <span className="chip chip-ok hidden min-[480px]:inline-flex">
                  <InfinityIcon size={11} /> {t("chat.unlimited")}
                </span>
                <span className="chip chip-info hidden sm:inline-flex">
                  <Sparkles size={11} /> {t("chat.historySaved")}
                </span>
                {activeConversation ? (
                  <label className="chip chip-info inline-flex items-center gap-1">
                    <Folder size={11} />
                    <select
                      value={activeConversation.project_id ?? ""}
                      onChange={(e) =>
                        void handleMoveChat(e.target.value || null)
                      }
                      disabled={isSending}
                      className="max-w-[min(8rem,42vw)] bg-transparent text-[11px] outline-none sm:max-w-[8rem]"
                      aria-label={t("chat.moveChatAria")}
                      title={t("chat.moveToProject")}
                    >
                      <option value="">{t("chat.noProject")}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            <Link
              href="/models"
              title={t("chat.modelsGuideHint")}
              aria-label={t("chat.modelsGuide")}
              className="touch-target inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-info-border)] bg-[var(--chip-info-bg)] px-2 py-1.5 text-xs font-medium text-[var(--chip-info-text)] transition hover:border-[var(--accent)]/50 hover:opacity-90 sm:px-2.5"
            >
              <Boxes size={14} />
              <span>{t("chat.modelsGuide")}</span>
            </Link>
            {activeId ? (
              <button
                ref={shareBtnRef}
                type="button"
                onClick={() => {
                  if (shareToken) {
                    setShareOpen((v) => !v);
                  } else {
                    void handleCreateShare(false);
                  }
                }}
                disabled={shareBusy}
                className={`touch-target inline-flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs transition sm:px-2.5 ${
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
                <span className="hidden min-[420px]:inline">
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

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 w-full items-center gap-2 text-xs text-[var(--text-muted)] sm:w-auto sm:flex-1 sm:flex-none">
              <span className="hidden shrink-0 sm:inline">{t("chat.model")}</span>
              <ModelPicker
                models={models}
                value={model}
                onChange={handleModelSelect}
                disabled={ready && isSending}
                emptyLabel={t("chat.noModels")}
                ariaLabel={t("chat.model")}
                className="min-w-0 w-full sm:max-w-[16rem]"
              />
            </div>
          </div>

          {activeId ? (
            <>
              {sharePortalReady && shareOpen && shareToken
                ? createPortal(
                    <div
                      ref={shareMenuRef}
                      role="dialog"
                      aria-modal="true"
                      aria-label={t("chat.shareChat")}
                      className="fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl"
                      style={
                        shareMenuPos.fullWidth
                          ? {
                              top: shareMenuPos.top,
                              left: 12,
                              right: 12,
                              width: "auto",
                            }
                          : {
                              top: shareMenuPos.top,
                              right: shareMenuPos.right,
                            }
                      }
                    >
                      <p className="text-xs font-medium text-[var(--text)]">
                        {t("chat.shareColleagueTitle")}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {t("chat.shareColleagueSub")}
                      </p>
                      <input
                        readOnly
                        value={shareUrl}
                        autoFocus
                        className="mt-2 w-full truncate rounded-lg border border-[var(--border)] bg-[var(--select-bg)] px-2 py-1.5 text-[11px] text-[var(--text)]"
                        onFocus={(e) => e.target.select()}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleCopyShare()}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-medium text-white"
                        >
                          {shareCopied ? (
                            <Check size={12} />
                          ) : (
                            <Link2 size={12} />
                          )}
                          {shareCopied ? t("common.copied") : t("chat.copyLink")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCreateShare(true)}
                          disabled={shareBusy}
                          className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)]"
                        >
                          {t("chat.newLink")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRevokeShare()}
                          disabled={shareBusy}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11px] text-[var(--danger)] hover:bg-[var(--hover)]"
                        >
                          <Link2Off size={12} />
                          {t("chat.revoke")}
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )
                : null}
            </>
          ) : null}
        </header>

        {(modelsError || error) && (
          <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-[var(--text)]">
            <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
              <p>{error || modelsError}</p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setModelsError("");
                  void loadModels();
                }}
                className="shrink-0 rounded-md p-1 hover:bg-amber-500/15"
                aria-label={t("common.dismiss")}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-6 text-center sm:px-6">
              <Image
                src={sinamLogo}
                alt={t("common.brand")}
                width={84}
                height={84}
                className="soft-rise h-[84px] w-[84px] rounded-full shadow-[0_12px_40px_rgba(37,99,235,0.18)]"
                style={{ width: "auto", height: "auto" }}
                priority
              />
              <p className="mt-5 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
                {t("chat.helloUser", { name: user.username })}
              </p>
              <p className="mt-3 max-w-md text-[var(--text-muted)]">
                {t("chat.signedInSub")}
              </p>
              <div className="mt-8 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestions.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => void handleSend(item.prompt)}
                    disabled={ready && (isSending || !model)}
                    className="soft-rise rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-md disabled:opacity-50"
                    style={{ animationDelay: `${0.05 * index}s` }}
                  >
                    <span className="block text-sm font-medium text-[var(--text)]">
                      {item.title}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-5 px-3 py-4 sm:px-4 sm:py-6 md:px-6">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isLastUser = lastUserMessage?.id === message.id;
                const isLastAssistant =
                  lastAssistantMessage?.id === message.id;
                const isEditing = editingId === message.id;

                return (
                  <div
                    key={message.id}
                    className={`animate-fade-up flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] md:max-w-[85%] ${isUser ? "" : "w-full"}`}
                    >
                      <div
                        className={`mb-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)] ${
                          isUser ? "justify-end" : ""
                        }`}
                      >
                        {!isUser ? (
                          <Image
                            src={sinamLogo}
                            alt=""
                            width={16}
                            height={16}
                            className="h-4 w-4 rounded-full"
                            style={{ width: "auto", height: "auto" }}
                          />
                        ) : null}
                        <span>{isUser ? t("chat.you") : t("common.brand")}</span>
                        {message.created_at ? (
                          <span className="opacity-70">
                            · {formatChatTime(message.created_at, locale)}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm ${
                          isUser
                            ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm"
                            : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] shadow-sm"
                        }`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={4}
                              className="w-full resize-y rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50"
                              autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={isSending || !editDraft.trim()}
                                onClick={() => void handleSaveEdit()}
                                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-40"
                              >
                                {t("chat.saveRegenerate")}
                              </button>
                              <button
                                type="button"
                                disabled={isSending}
                                onClick={handleCancelEdit}
                                className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/90"
                              >
                                {t("common.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : isUser ? (
                          <div className="space-y-2">
                            <MessageImages
                              items={
                                message.localImages?.map((img) => ({
                                  src: imagePreviewUrl(img),
                                  name: img.name,
                                })) ??
                                message.attachments
                                  ?.filter((item) => item.type === "image")
                                  .map((item) => ({
                                    src: attachmentUrl(message.id, item.index),
                                    name: item.name,
                                  })) ??
                                []
                              }
                            />
                            {message.localAudio ? (
                              <MessageAudio
                                src={message.localAudio.previewUrl}
                                name={message.localAudio.name}
                              />
                            ) : (
                              message.attachments
                                ?.filter((item) => item.type === "audio")
                                .map((item) => (
                                  <MessageAudio
                                    key={item.index}
                                    src={attachmentUrl(message.id, item.index)}
                                    name={item.name}
                                  />
                                ))
                            )}
                            {message.content ? (
                              <p className="whitespace-pre-wrap">
                                {message.content}
                              </p>
                            ) : null}
                          </div>
                        ) : message.content ? (
                          <MarkdownMessage content={message.content} />
                        ) : (
                          <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        )}
                      </div>
                      {!isUser && !message.isStreaming ? (
                        <KnowledgeCitations sources={message.sources} />
                      ) : null}
                      {!isSending && !isEditing ? (
                        <div
                          className={`mt-1 flex max-w-full items-center gap-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible ${
                            isUser ? "justify-end" : ""
                          }`}
                        >
                          {!isUser && message.content ? (
                            <CopyButton
                              text={message.content}
                              className="text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                            />
                          ) : null}
                          {isUser && isLastUser ? (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(message)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                            >
                              <Pencil size={12} />
                              {t("chat.edit")}
                            </button>
                          ) : null}
                          {!isUser && isLastAssistant && message.content ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRewrite("shorter")}
                                className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
                              >
                                {t("chat.shorter")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRewrite("formal")}
                                className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
                              >
                                {t("chat.moreFormal")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRewrite("continue")}
                                className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
                              >
                                {t("chat.continue")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRegenerate()}
                                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] sm:py-1"
                              >
                                <RefreshCw size={12} />
                                {t("chat.regenerate")}
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="safe-bottom border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-3 backdrop-blur md:px-5">
          <div
            className={`composer-shell relative mx-auto flex max-w-3xl flex-col gap-2 rounded-[24px] border bg-[var(--composer-bg)] p-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-[var(--ring)] ${
              isDraggingOver
                ? "border-sky-400 ring-4 ring-[var(--ring)]"
                : "border-[var(--border)]"
            }`}
            style={{ boxShadow: "var(--composer-shadow)" }}
            onDragEnter={handleComposerDragEnter}
            onDragOverCapture={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDropCapture={handleComposerDrop}
          >
            {isDraggingOver ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-sky-500/15 text-sm font-medium text-sky-800 dark:text-sky-100">
                {supportsAudio && supportsVision
                  ? t("chat.dropImagesOrAudio")
                  : supportsAudio
                    ? t("chat.dropAudio")
                    : t("chat.dropImages")}
              </div>
            ) : null}
            {pendingImages.length ? (
              <div className="px-2 pt-1">
                <MessageImages
                  tone="composer"
                  items={pendingImages.map((img) => ({
                    src: imagePreviewUrl(img),
                    name: img.name,
                  }))}
                  onRemove={(index) =>
                    setPendingImages((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                  removeLabel={t("chat.removeImage")}
                />
              </div>
            ) : null}
            {pendingAudio ? (
              <div className="px-2 pt-1">
                <MessageAudio
                  tone="composer"
                  src={pendingAudio.previewUrl}
                  name={pendingAudio.name}
                  onRemove={clearPendingAudio}
                  removeLabel={t("chat.removeAudio")}
                />
              </div>
            ) : null}
            {isRecording ? (
              <div className="flex items-center gap-2 px-3 pt-1 text-xs text-red-600">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span>
                  {t("chat.recording", {
                    n: Math.min(
                      MAX_AUDIO_SECONDS,
                      Math.ceil(recordElapsedMs / 1000),
                    ),
                  })}
                </span>
                <span
                  className="h-1.5 w-16 overflow-hidden rounded-full bg-red-900/20"
                  title={t("chat.micLevel")}
                >
                  <span
                    className="block h-full bg-red-500 transition-[width] duration-100"
                    style={{
                      width: `${Math.min(100, Math.round(micLevel * 160))}%`,
                    }}
                  />
                </span>
                {currentMicLabel ? (
                  <span className="min-w-0 truncate text-[var(--text-muted)]">
                    {currentMicLabel}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              {supportsVision ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.target.value = "";
                      void addImageFiles(files);
                    }}
                  />
                  <button
                    type="button"
                    disabled={ready && (isSending || !model)}
                    onClick={() => fileInputRef.current?.click()}
                    className="touch-target mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40 sm:h-10 sm:w-10"
                    aria-label={t("chat.attachImage")}
                    title={t("chat.attachImage")}
                  >
                    <Paperclip size={16} />
                  </button>
                </>
              ) : null}
              {supportsAudio ? (
                <div className="relative mb-0.5 flex shrink-0 items-center" ref={micPickerRef}>
                  <button
                    type="button"
                    disabled={ready && (isSending || isProcessingAudio || !model)}
                    onClick={() => void handleToggleMic()}
                    className={`touch-target inline-flex h-11 w-11 items-center justify-center rounded-full transition disabled:opacity-40 sm:h-10 sm:w-10 ${
                      isRecording
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                    }`}
                    aria-label={
                      isRecording
                        ? t("chat.stopRecording")
                        : t("chat.recordAudio")
                    }
                    title={
                      isRecording
                        ? t("chat.stopRecording")
                        : currentMicLabel || t("chat.recordAudio")
                    }
                  >
                    {isRecording ? (
                      <Square size={14} fill="currentColor" />
                    ) : (
                      <Mic size={16} />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={
                      ready &&
                      (isSending || isRecording || isProcessingAudio || !model)
                    }
                    onClick={() => void handleOpenMicPicker()}
                    className="touch-target inline-flex h-11 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40 sm:h-10"
                    aria-label={t("chat.chooseMic")}
                    title={t("chat.chooseMic")}
                    aria-expanded={micPickerOpen}
                  >
                    <ChevronDown size={14} />
                  </button>
                  {micPickerOpen ? (
                    <div className="absolute bottom-full left-0 z-30 mb-2 min-w-[14rem] max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-lg">
                      <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        {t("chat.chooseMic")}
                      </p>
                      {micDevices.length ? (
                        micDevices.map((device) => {
                          const selected = device.deviceId === micDeviceId;
                          return (
                            <button
                              key={device.deviceId}
                              type="button"
                              onClick={() => handleSelectMic(device.deviceId)}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--hover)] ${
                                selected ? "font-medium" : ""
                              }`}
                            >
                              <Check
                                size={12}
                                className={
                                  selected ? "opacity-100" : "opacity-0"
                                }
                              />
                              <span className="min-w-0 truncate">
                                {device.label}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                          {t("chat.micNotFound")}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
                  const files = Array.from(event.clipboardData.files);
                  if (!files.length) return;
                  event.preventDefault();
                  void addDroppedFiles(files);
                }}
                rows={1}
                placeholder={
                  pendingAudio
                    ? t("chat.audioPlaceholder")
                    : pendingImages.length
                      ? t("chat.imagePlaceholder")
                      : t("chat.messagePlaceholder")
                }
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] sm:text-[15px]"
              />
              {isSending ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="touch-target mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] transition hover:opacity-90 sm:h-10 sm:w-10"
                  aria-label={t("chat.stopGenerating")}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={
                    ready &&
                    (isProcessingAudio ||
                      (!input.trim() &&
                        pendingImages.length === 0 &&
                        !pendingAudio &&
                        !isRecording) ||
                      !model)
                  }
                  className="touch-target mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
                  aria-label={t("chat.sendMessage")}
                >
                  <SendHorizonal size={16} />
                </button>
              )}
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] leading-snug text-[var(--text-muted)] sm:text-[11px]">
            {supportsAudio && supportsVision
              ? t("chat.audioVisionFooterHint")
              : supportsAudio
                ? t("chat.audioFooterHint")
                : supportsVision
                  ? t("chat.visionFooterHint")
                  : t("chat.footerHint")}
          </p>
        </div>
      </main>
    </div>
  );
};
