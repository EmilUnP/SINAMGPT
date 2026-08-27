import { SendHorizonal, Square } from "lucide-react";
import type {
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import type { useLocale } from "@/components/LocaleProvider";
import { imagePreviewUrl } from "@/lib/media/compress-image";
import { MAX_AUDIO_SECONDS } from "@/lib/media/limits";
import type { MicDevice } from "@/lib/media/record-mic";
import { fleetHintKey } from "@/lib/model-fleet";
import {
  ComposerToolsMenu,
  type ComposerToolSection,
} from "./ComposerToolsMenu";
import { MessageAudio, VoiceRecordingPreview } from "./MessageAudio";
import { MessageImages } from "./MessageImages";
import { ModelPicker, type ModelOption } from "./ModelPicker";
import { ChatMicControls } from "./ChatMicControls";
import type { PendingAudio, PendingImage } from "./chat-types";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatComposerProps = {
  input: string;
  pendingImages: PendingImage[];
  pendingAudio: PendingAudio | null;
  isRecording: boolean;
  isProcessingAudio: boolean;
  recordElapsedMs: number;
  micLevel: number;
  micDevices: MicDevice[];
  micDeviceId: string;
  micPickerOpen: boolean;
  currentMicLabel: string;
  isDraggingOver: boolean;
  isSending: boolean;
  isReady: boolean;
  canUseMic: boolean;
  canAttachImages: boolean;
  canImportImages: boolean;
  model: string;
  models: ModelOption[];
  toolSections: ComposerToolSection[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  micPickerRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFiles: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onRemoveAudio: () => void;
  onModelChange: (name: string) => void;
  onToggleMic: () => void;
  onOpenMicPicker: () => void;
  onSelectMic: (deviceId: string) => void;
  onSend: () => void;
  onStop: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  t: Translate;
};

export const ChatComposer = ({
  input,
  pendingImages,
  pendingAudio,
  isRecording,
  isProcessingAudio,
  recordElapsedMs,
  micLevel,
  micDevices,
  micDeviceId,
  micPickerOpen,
  currentMicLabel,
  isDraggingOver,
  isSending,
  isReady,
  canUseMic,
  canAttachImages,
  canImportImages,
  model,
  models,
  toolSections,
  textareaRef,
  fileInputRef,
  micPickerRef,
  onInputChange,
  onKeyDown,
  onPaste,
  onFiles,
  onRemoveImage,
  onRemoveAudio,
  onModelChange,
  onToggleMic,
  onOpenMicPicker,
  onSelectMic,
  onSend,
  onStop,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  t,
}: ChatComposerProps) => (
  <div className="safe-bottom relative z-20 overflow-visible border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-3 backdrop-blur md:px-5">
    <div
      className={`composer-shell relative mx-auto flex max-w-3xl flex-col gap-2 rounded-[24px] border bg-[var(--composer-bg)] p-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-[var(--ring)] ${
        isDraggingOver
          ? "border-sky-400 ring-4 ring-[var(--ring)]"
          : "border-[var(--border)]"
      }`}
      style={{ boxShadow: "var(--composer-shadow)" }}
      onDragEnter={onDragEnter}
      onDragOverCapture={onDragOver}
      onDragLeave={onDragLeave}
      onDropCapture={onDrop}
    >
      {isDraggingOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-sky-500/15 text-sm font-medium text-sky-800 dark:text-sky-100">
          {t("chat.dropImages")}
        </div>
      ) : null}
      {pendingImages.length ? (
        <div className="px-2 pt-1">
          <MessageImages
            tone="composer"
            items={pendingImages.map((image) => ({
              src: imagePreviewUrl(image),
              name: image.name,
            }))}
            onRemove={onRemoveImage}
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
            durationMs={pendingAudio.durationMs}
            onRemove={onRemoveAudio}
            removeLabel={t("chat.removeAudio")}
          />
        </div>
      ) : null}
      {isRecording ? (
        <VoiceRecordingPreview
          elapsedMs={recordElapsedMs}
          level={micLevel}
          label={t("chat.recording", {
            n: Math.min(MAX_AUDIO_SECONDS, Math.ceil(recordElapsedMs / 1000)),
          })}
        />
      ) : null}
      <div className="flex items-end gap-1.5 sm:gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            onFiles(files);
          }}
        />
        <ComposerToolsMenu
          sections={toolSections}
          disabled={isReady && (isSending || !model)}
          ariaLabel={t("chat.toolsMenu")}
          closeLabel={t("chat.closeTools")}
        />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder={
            pendingAudio
              ? t("chat.audioPlaceholder")
              : pendingImages.length
                ? t("chat.imagePlaceholder")
                : t("chat.messagePlaceholder")
          }
          className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] sm:px-3 sm:text-[15px]"
        />
        <ModelPicker
          models={models}
          value={model}
          onChange={onModelChange}
          disabled={isReady && isSending}
          size="sm"
          variant="composer"
          emptyLabel={t("chat.noModels")}
          ariaLabel={t("chat.model")}
          hintFor={(option) => {
            const key = fleetHintKey(option.name);
            return key ? t(key) : undefined;
          }}
          className="shrink-0"
        />
        {canUseMic ? (
          <ChatMicControls
            isReady={isReady}
            isSending={isSending}
            isRecording={isRecording}
            isProcessing={isProcessingAudio}
            hasModel={Boolean(model)}
            isPickerOpen={micPickerOpen}
            devices={micDevices}
            deviceId={micDeviceId}
            currentLabel={currentMicLabel}
            pickerRef={micPickerRef}
            onToggle={onToggleMic}
            onOpenPicker={onOpenMicPicker}
            onSelect={onSelectMic}
            t={t}
          />
        ) : null}
        {isSending ? (
          <button
            type="button"
            onClick={onStop}
            className="touch-target mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--text)] text-[var(--bg)] transition hover:opacity-90 sm:h-10 sm:w-10"
            aria-label={t("chat.stopGenerating")}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={
              isReady &&
              (isProcessingAudio ||
                (!input.trim() &&
                  pendingImages.length === 0 &&
                  !pendingAudio &&
                  !isRecording) ||
                !model)
            }
            className="touch-target mb-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)] transition hover:from-blue-500 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:w-10"
            aria-label={t("chat.sendMessage")}
          >
            <SendHorizonal size={16} />
          </button>
        )}
      </div>
    </div>
    <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] leading-snug text-[var(--text-muted)] sm:text-[11px]">
      {canUseMic && (canAttachImages || canImportImages)
        ? t("chat.audioVisionFooterHint")
        : canUseMic
          ? t("chat.audioFooterHint")
          : canAttachImages || canImportImages
            ? t("chat.visionFooterHint")
            : t("chat.footerHint")}
    </p>
  </div>
);
