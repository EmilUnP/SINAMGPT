import type { useLocale } from "@/components/LocaleProvider";

type Translate = ReturnType<typeof useLocale>["t"];

type ChatMessageEditProps = {
  draft: string;
  isSending: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  t: Translate;
};

export const ChatMessageEdit = ({
  draft,
  isSending,
  onDraftChange,
  onSave,
  onCancel,
  t,
}: ChatMessageEditProps) => (
  <div className="space-y-2">
    <textarea
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      rows={4}
      className="w-full resize-y rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50"
      autoFocus
    />
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isSending || !draft.trim()}
        onClick={onSave}
        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-40"
      >
        {t("chat.saveRegenerate")}
      </button>
      <button
        type="button"
        disabled={isSending}
        onClick={onCancel}
        className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/90"
      >
        {t("common.cancel")}
      </button>
    </div>
  </div>
);
