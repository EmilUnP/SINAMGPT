"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/components/LocaleProvider";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type Pending = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const t = useTranslations();
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      setPending((current) => {
        current?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement;
    const focusTarget =
      pending.tone === "danger" ? cancelRef.current : confirmRef.current;
    focusTarget?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [pending, close]);

  const dialog =
    pending && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 p-4 sm:items-center"
            onClick={() => close(false)}
            role="presentation"
          >
            <div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-2xl sm:p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <h2
                id={titleId}
                className="text-base font-semibold text-[var(--text)]"
              >
                {pending.title || t("common.confirmTitle")}
              </h2>
              <p
                id={descId}
                className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]"
              >
                {pending.description}
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--hover)]"
                >
                  {pending.cancelLabel || t("common.cancel")}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => close(true)}
                  className={
                    pending.tone === "danger"
                      ? "rounded-xl bg-[var(--danger)] px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                      : "rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  }
                >
                  {pending.confirmLabel || t("common.confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
};
