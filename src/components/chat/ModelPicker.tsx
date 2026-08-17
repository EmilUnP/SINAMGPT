"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import { useIsMounted } from "@/lib/use-mounted";

export type ModelOption = {
  name: string;
  display_name?: string;
  backend?: string;
  vision?: boolean;
  tools?: boolean;
};

type ModelPickerProps = {
  models: ModelOption[];
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  /** Shown on the trigger when no model is available. */
  emptyLabel: string;
  ariaLabel: string;
  size?: "sm" | "md";
  /** "glass" matches the guest landing header; "panel" the signed-in chrome. */
  variant?: "panel" | "glass";
  className?: string;
};

const backendLabel = (backend?: string) => {
  if (backend === "vllm") return "vLLM";
  if (backend === "ollama") return "Ollama";
  return null;
};

const modelLabel = (option: ModelOption) => option.display_name || option.name;

export const ModelPicker = ({
  models,
  value,
  onChange,
  disabled = false,
  emptyLabel,
  ariaLabel,
  size = "md",
  variant = "panel",
  className = "",
}: ModelPickerProps) => {
  const mounted = useIsMounted();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const isEmpty = models.length === 0;
  const isDisabled = disabled || isEmpty;
  const selectedIndex = models.findIndex((m) => m.name === value);
  const selected = selectedIndex >= 0 ? models[selectedIndex] : null;

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 208);
    // Keep the panel on screen when the trigger sits near the right edge.
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    setPos({ top: rect.bottom + 8, left, minWidth: rect.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onReflow = () => updatePos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  // The panel owns the key handling while it is open, so it needs the focus.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const openMenu = () => {
    if (isDisabled) return;
    setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = models[index];
    if (option) onChange(option.name);
    setOpen(false);
    triggerRef.current?.focus();
  };

  /* A native select handles all of this for free; a custom one has to earn it. */
  const onTriggerKeyDown = (event: ReactKeyboardEvent) => {
    if (isDisabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openMenu();
    }
  };

  /*
   * Bound on the document rather than via onKeyDown on the panel: the panel is
   * portalled to <body>, outside the React root, and React's synthetic keydown
   * does not reach it there. Click-outside above is bound the same way.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      const count = models.length;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((i) => (i + 1) % count);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((i) => (i - 1 + count) % count);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setFocusedIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setFocusedIndex(count - 1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        commit(focusedIndex);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // commit is stable enough for this scope; focusedIndex must stay current.
  }, [open, models, focusedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-3 py-1.5 text-sm";

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            className="menu-surface fixed z-[200] max-h-72 overflow-y-auto rounded-xl p-1"
            style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          >
            {models.map((option, index) => {
              const active = option.name === value;
              const backend = backendLabel(option.backend);
              return (
                <button
                  key={option.name}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => commit(index)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={`menu-item flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                    active ? "is-active" : ""
                  } ${index === focusedIndex ? "is-focused" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {modelLabel(option)}
                  </span>
                  {option.vision ? (
                    <span className="shrink-0 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-600 dark:text-sky-300">
                      {t("chat.vision")}
                    </span>
                  ) : null}
                  {option.tools ? (
                    <span className="shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300">
                      {t("chat.tools")}
                    </span>
                  ) : null}
                  {backend ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-60">
                      {backend}
                    </span>
                  ) : null}
                  {active ? <Check size={14} className="shrink-0" /> : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={isDisabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        title={selected ? modelLabel(selected) : emptyLabel}
        className={`model-picker-trigger inline-flex w-full items-center gap-1.5 rounded-full ${pad} ${
          variant === "glass" ? "on-glass" : ""
        } outline-none transition disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? modelLabel(selected) : emptyLabel}
        </span>
        {selected?.vision ? (
          <span className="hidden shrink-0 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-600 sm:inline dark:text-sky-300">
            {t("chat.vision")}
          </span>
        ) : null}
        <ChevronDown
          size={size === "sm" ? 13 : 14}
          className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </div>
  );
};
