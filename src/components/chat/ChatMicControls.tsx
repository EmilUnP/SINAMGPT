import { Check, ChevronDown, Mic, Square } from "lucide-react";
import type { RefObject } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { MicDevice } from "@/lib/record-mic";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatMicControlsProps = {
  isReady: boolean;
  isSending: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  hasModel: boolean;
  isPickerOpen: boolean;
  devices: MicDevice[];
  deviceId: string;
  currentLabel: string;
  pickerRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onOpenPicker: () => void;
  onSelect: (deviceId: string) => void;
  t: Translate;
};

export const ChatMicControls = ({
  isReady,
  isSending,
  isRecording,
  isProcessing,
  hasModel,
  isPickerOpen,
  devices,
  deviceId,
  currentLabel,
  pickerRef,
  onToggle,
  onOpenPicker,
  onSelect,
  t,
}: ChatMicControlsProps) => (
  <div
    className="relative mb-0.5 flex h-11 shrink-0 items-center sm:h-10"
    ref={pickerRef}
  >
    <button
      type="button"
      disabled={isReady && (isSending || isProcessing || !hasModel)}
      onClick={onToggle}
      className={`touch-target inline-flex h-11 w-11 items-center justify-center rounded-full transition disabled:opacity-40 sm:h-10 sm:w-10 ${
        isRecording
          ? "bg-red-600 text-white hover:bg-red-500"
          : "text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      }`}
      aria-label={
        isRecording ? t("chat.stopRecording") : t("chat.recordAudio")
      }
      title={
        isRecording
          ? t("chat.stopRecording")
          : currentLabel || t("chat.recordAudio")
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
        isReady &&
        (isSending || isRecording || isProcessing || !hasModel)
      }
      onClick={onOpenPicker}
      className="touch-target inline-flex h-11 w-7 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40 sm:h-10"
      aria-label={t("chat.chooseMic")}
      title={t("chat.chooseMic")}
      aria-expanded={isPickerOpen}
    >
      <ChevronDown size={14} />
    </button>
    {isPickerOpen ? (
      <div className="absolute bottom-full right-0 z-30 mb-2 min-w-[14rem] max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-lg">
        <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {t("chat.chooseMic")}
        </p>
        {devices.length ? (
          devices.map((device) => {
            const selected = device.deviceId === deviceId;
            return (
              <button
                key={device.deviceId}
                type="button"
                onClick={() => onSelect(device.deviceId)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--hover)] ${
                  selected ? "font-medium" : ""
                }`}
              >
                <Check
                  size={12}
                  className={selected ? "opacity-100" : "opacity-0"}
                />
                <span className="min-w-0 truncate">{device.label}</span>
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
);
