import { Check, Link2, Link2Off } from "lucide-react";
import { createPortal } from "react-dom";
import type { useLocale } from "@/components/LocaleProvider";
import type { MutableElementRef, ShareMenuPosition } from "./chat-types";

type Translate = ReturnType<typeof useLocale>["t"];

type ShareMenuPortalProps = {
  isReady: boolean;
  isOpen: boolean;
  token: string | null;
  url: string;
  isBusy: boolean;
  isCopied: boolean;
  position: ShareMenuPosition;
  menuRef: MutableElementRef<HTMLDivElement>;
  onCopy: () => void;
  onRotate: () => void;
  onRevoke: () => void;
  t: Translate;
};

export const ShareMenuPortal = ({
  isReady,
  isOpen,
  token,
  url,
  isBusy,
  isCopied,
  position,
  menuRef,
  onCopy,
  onRotate,
  onRevoke,
  t,
}: ShareMenuPortalProps) => {
  if (!isReady || !isOpen || !token) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.shareChat")}
      className="fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-xl"
      style={
        position.fullWidth
          ? {
              top: position.top,
              left: 12,
              right: 12,
              width: "auto",
            }
          : { top: position.top, right: position.right }
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
        value={url}
        autoFocus
        className="mt-2 w-full truncate rounded-lg border border-[var(--border)] bg-[var(--select-bg)] px-2.5 py-2 text-base text-[var(--text)] sm:py-1.5 sm:text-[11px]"
        onFocus={(event) => event.target.select()}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
        >
          {isCopied ? <Check size={12} /> : <Link2 size={12} />}
          {isCopied ? t("common.copied") : t("chat.copyLink")}
        </button>
        <button
          type="button"
          onClick={onRotate}
          disabled={isBusy}
          className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--hover)] sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
        >
          {t("chat.newLink")}
        </button>
        <button
          type="button"
          onClick={onRevoke}
          disabled={isBusy}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--hover)] sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
        >
          <Link2Off size={12} />
          {t("chat.revoke")}
        </button>
      </div>
    </div>,
    document.body,
  );
};
