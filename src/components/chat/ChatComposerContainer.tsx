import type {
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { ComposerToolSection } from "./ComposerToolsMenu";
import { ChatComposer } from "./ChatComposer";
import type { useAttachmentsAndMic } from "./hooks/useAttachmentsAndMic";
import type { useChatModels } from "./hooks/useChatModels";
import type { useChatStream } from "./hooks/useChatStream";

type ChatComposerContainerProps = {
  input: string;
  setInput: (value: string) => void;
  isSending: boolean;
  isReady: boolean;
  canUseMic: boolean;
  canAttachImages: boolean;
  canImportImages: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  toolSections: ComposerToolSection[];
  attachments: ReturnType<typeof useAttachmentsAndMic>;
  modelState: ReturnType<typeof useChatModels>;
  stream: ReturnType<typeof useChatStream>;
  t: ReturnType<typeof useLocale>["t"];
};

export const ChatComposerContainer = ({
  input,
  setInput,
  isSending,
  isReady,
  canUseMic,
  canAttachImages,
  canImportImages,
  textareaRef,
  fileInputRef,
  toolSections,
  attachments,
  modelState,
  stream,
  t,
}: ChatComposerContainerProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void stream.send();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length || !canImportImages) return;
    event.preventDefault();
    void attachments.addDroppedFiles(files);
  };

  return (
    <ChatComposer
      input={input}
      pendingImages={attachments.pendingImages}
      pendingAudio={attachments.pendingAudio}
      isRecording={attachments.isRecording}
      isProcessingAudio={attachments.isProcessingAudio}
      recordElapsedMs={attachments.recordElapsedMs}
      micLevel={attachments.micLevel}
      micDevices={attachments.micDevices}
      micDeviceId={attachments.micDeviceId}
      micPickerOpen={attachments.micPickerOpen}
      currentMicLabel={attachments.currentMicLabel}
      isDraggingOver={attachments.isDraggingOver}
      isSending={isSending}
      isReady={isReady}
      canUseMic={canUseMic}
      canAttachImages={canAttachImages}
      canImportImages={canImportImages}
      model={modelState.model}
      models={modelState.models}
      toolSections={toolSections}
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      micPickerRef={attachments.micPickerRef}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFiles={(files) => void attachments.addImageFiles(files)}
      onRemoveImage={(index) =>
        attachments.setPendingImages((current) =>
          current.filter((_, itemIndex) => itemIndex !== index),
        )
      }
      onRemoveAudio={attachments.clearPendingAudio}
      onModelChange={modelState.selectModel}
      onToggleMic={() => void attachments.handleToggleMic()}
      onOpenMicPicker={() => void attachments.handleOpenMicPicker()}
      onSelectMic={attachments.handleSelectMic}
      onSend={() => void stream.send()}
      onStop={stream.stop}
      onDragEnter={attachments.dragHandlers.onDragEnter}
      onDragOver={attachments.dragHandlers.onDragOver}
      onDragLeave={attachments.dragHandlers.onDragLeave}
      onDrop={attachments.dragHandlers.onDrop}
      t={t}
    />
  );
};
