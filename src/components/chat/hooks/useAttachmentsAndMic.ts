import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import { fileToChatImage } from "@/lib/compress-image";
import { dropHasFiles, isDroppedImageFile } from "@/lib/chat-drop";
import { MAX_CHAT_IMAGES } from "@/lib/image-limits";
import {
  ensureMicPermission,
  listMicDevices,
  startMicRecording,
  type MicSession,
  type RecordedWav,
} from "@/lib/record-mic";
import { persistMicChoice, readStoredMic } from "../chat-storage";
import type { PendingAudio, PendingImage } from "../chat-types";

type Translate = ReturnType<typeof useLocale>["t"];

type UseAttachmentsAndMicOptions = {
  canAttachImages: boolean;
  canImportImages: boolean;
  canUseMic: boolean;
  isSending: boolean;
  setError: (message: string) => void;
  t: Translate;
};

export const useAttachmentsAndMic = ({
  canAttachImages,
  canImportImages,
  canUseMic,
  isSending,
  setError,
  t,
}: UseAttachmentsAndMicOptions) => {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [recordElapsedMs, setRecordElapsedMs] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [micDevices, setMicDevices] = useState<
    Awaited<ReturnType<typeof listMicDevices>>
  >([]);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const recorderRef = useRef<MicSession | null>(null);
  const micPickerRef = useRef<HTMLDivElement | null>(null);
  const micDeviceIdRef = useRef("");
  const dragDepthRef = useRef(0);
  const canDropFiles = canImportImages;

  const clearPendingAudio = useCallback(() => setPendingAudio(null), []);

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
    [setError, t],
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
      return applyRecordedClip(await session.stop());
    } catch (error) {
      setError(error instanceof Error ? error.message : t("chat.micFailed"));
      return null;
    } finally {
      setIsProcessingAudio(false);
      setRecordElapsedMs(0);
    }
  }, [applyRecordedClip, pendingAudio, setError, t]);

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
      const wanted = preferred || current || readStoredMic();
      const next =
        wanted && list.some((device) => device.deviceId === wanted)
          ? wanted
          : (list[0]?.deviceId ?? "");
      micDeviceIdRef.current = next;
      return next;
    });
    return list;
  }, []);

  useEffect(() => {
    if (canAttachImages || canImportImages || !pendingImages.length) return;
    const timeout = window.setTimeout(() => setPendingImages([]), 0);
    return () => window.clearTimeout(timeout);
  }, [canAttachImages, canImportImages, pendingImages.length]);

  useEffect(() => {
    if (!canUseMic) {
      const timeout = window.setTimeout(() => {
        setMicDevices([]);
        setMicPickerOpen(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => void refreshMicDevices(), 0);
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) {
      return () => window.clearTimeout(timeout);
    }
    const handleChange = () => void refreshMicDevices();
    media.addEventListener("devicechange", handleChange);
    return () => {
      window.clearTimeout(timeout);
      media.removeEventListener("devicechange", handleChange);
    };
  }, [canUseMic, refreshMicDevices]);

  useEffect(() => {
    if (!micPickerOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (!micPickerRef.current?.contains(event.target as Node)) {
        setMicPickerOpen(false);
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMicPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [micPickerOpen]);

  useEffect(() => {
    micDeviceIdRef.current = micDeviceId;
  }, [micDeviceId]);

  useEffect(() => {
    if (canUseMic) return;
    const timeout = window.setTimeout(() => {
      cancelMicSession();
      if (pendingAudio) clearPendingAudio();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [canUseMic, pendingAudio, cancelMicSession, clearPendingAudio]);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  const imageErrorMessage = (code: "type" | "size" | "failed") => {
    if (code === "type") return t("chat.imageType");
    if (code === "size") return t("chat.imageTooLarge");
    return t("chat.imageFailed");
  };

  const addImageFiles = async (files: File[]) => {
    if ((!canAttachImages && !canImportImages) || !files.length) return;
    const remaining = MAX_CHAT_IMAGES - pendingImages.length;
    if (remaining <= 0) {
      setError(t("chat.imageLimit", { n: MAX_CHAT_IMAGES }));
      return;
    }
    const next: PendingImage[] = [];
    for (const file of files.slice(0, remaining)) {
      const result = await fileToChatImage(file);
      if (!result.ok) {
        setError(imageErrorMessage(result.code));
        continue;
      }
      next.push({
        ...result.image,
        id: `img-${Date.now()}-${Math.random()}`,
      });
    }
    if (next.length) {
      setPendingImages((current) =>
        [...current, ...next].slice(0, MAX_CHAT_IMAGES),
      );
      setError("");
    }
  };

  const addDroppedFiles = async (files: File[]) => {
    if (!files.length || isSending || !canDropFiles) return;
    const images = files.filter(isDroppedImageFile);
    if (!images.length) {
      setError(t("chat.dropUnsupported"));
      return;
    }
    await addImageFiles(images);
    if (images.length < files.length) setError(t("chat.dropUnsupported"));
  };

  const handleToggleMic = async () => {
    if (!canUseMic || isSending || isProcessingAudio) return;
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
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(t("chat.micDenied"));
      } else if (
        name === "OverconstrainedError" ||
        name === "ConstraintNotSatisfiedError"
      ) {
        setError(t("chat.micSwitchFailed"));
      } else {
        setError(
          error instanceof Error && error.message
            ? error.message
            : t("chat.micFailed"),
        );
      }
    }
  };

  const handleOpenMicPicker = async () => {
    if (!canUseMic || isRecording || isSending || isProcessingAudio) return;
    if (micPickerOpen) {
      setMicPickerOpen(false);
      return;
    }
    try {
      setError("");
      await ensureMicPermission(micDeviceIdRef.current || micDeviceId);
      await refreshMicDevices(micDeviceId);
      setMicPickerOpen(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? t("chat.micDenied")
          : error instanceof Error && error.message
            ? error.message
            : t("chat.micFailed"),
      );
    }
  };

  const handleSelectMic = (deviceId: string) => {
    micDeviceIdRef.current = deviceId;
    setMicDeviceId(deviceId);
    persistMicChoice(deviceId);
    setMicPickerOpen(false);
  };

  const dragHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!dropHasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (canDropFiles) setIsDraggingOver(true);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!dropHasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = canDropFiles ? "copy" : "none";
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!dropHasFiles(event.dataTransfer.types)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingOver(false);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDraggingOver(false);
      void addDroppedFiles(Array.from(event.dataTransfer.files));
    },
  };

  return {
    pendingImages,
    setPendingImages,
    pendingAudio,
    setPendingAudio,
    isRecording,
    isProcessingAudio,
    recordElapsedMs,
    micLevel,
    micDevices,
    micDeviceId,
    micPickerOpen,
    isDraggingOver,
    micPickerRef,
    stopMicSession,
    cancelMicSession,
    clearPendingAudio,
    addImageFiles,
    addDroppedFiles,
    handleToggleMic,
    handleOpenMicPicker,
    handleSelectMic,
    dragHandlers,
    currentMicLabel:
      micDevices.find((device) => device.deviceId === micDeviceId)?.label || "",
  };
};
