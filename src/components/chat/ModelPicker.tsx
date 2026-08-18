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
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import { useIsMounted } from "@/lib/use-mounted";

export type ModelOption = {
  name: string;
  display_name?: string;
  backend?: string;
  vision?: boolean;
  tools?: boolean;
  audio?: boolean;
  video?: boolean;
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
  /** "glass" matches the guest landing header; "composer" sits in the chat box. */
  variant?: "panel" | "glass" | "composer";
  /** One-line subtitle under each model name in the menu. */
  hintFor?: (option: ModelOption) => string | undefined;
  className?: string;
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
  hintFor,
  className = "",
}: ModelPickerProps) => {
  const mounted = useIsMounted();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [pos, setPos] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    minWidth: 0,
    maxHeight: 288,
    openUp: false,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const isEmpty = models.length === 0;
  const isDisabled = disabled || isEmpty;
  const selectedIndex = models.findIndex((m) => m.name === value);
  const selected = selectedIndex >= 0 ? models[selectedIndex] : null;

  const isComposer = variant === "composer";

  const updatePos = () => {
    if (isComposer) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
    const menuMaxH = 288;
    const safeBottom = 12;
    const spaceBelow = window.innerHeight - rect.bottom - safeBottom;
    const spaceAbove = rect.top - safeBottom;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove - 8 : spaceBelow - 8;
    const maxHeight = Math.max(120, Math.min(menuMaxH, available));
    const gap = 8;
    setPos(
      openUp
        ? {
            top: 0,
            bottom: window.innerHeight - rect.top + gap,
            left,
            minWidth: width,
            maxHeight,
            openUp: true,
          }
        : {
            top: rect.bottom + gap,
            bottom: 0,
            left,
            minWidth: width,
            maxHeight,
            openUp: false,
          },
    );
  };

  useLayoutEffect(() => {
    if (!open || isComposer) return;
    updatePos();
    const onReflow = () => updatePos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, isComposer]);

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

  const menuItems = models.map((option, index) => {
    const active = option.name === value;
    const hint = hintFor?.(option);
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
        {active ? (
          <Check size={14} className="shrink-0" />
        ) : (
          <span className="inline-block w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{modelLabel(option)}</span>
          {hint ? (
            <span className="mt-0.5 block truncate text-[11px] font-normal text-[var(--text-muted)]">
              {hint}
            </span>
          ) : null}
        </span>
        <ModelCapabilityBadges
          presentation="icons"
          vision={option.vision}
          audio={option.audio}
          video={option.video}
          tools={option.tools}
        />
      </button>
    );
  });

  const menuPanel = open ? (
    <div
      ref={menuRef}
      id={listId}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={`menu-surface overflow-y-auto rounded-xl p-1 ${
        isComposer
          ? "absolute bottom-full right-0 z-50 mb-2 min-w-[16rem] max-h-80"
          : "fixed z-[200]"
      }`}
      style={
        isComposer
          ? undefined
          : {
              top: pos.openUp ? "auto" : pos.top,
              bottom: pos.openUp ? pos.bottom : "auto",
              left: pos.left,
              minWidth: pos.minWidth,
              maxHeight: pos.maxHeight,
            }
      }
    >
      {menuItems}
    </div>
  ) : null;

  const menu =
    isComposer || !menuPanel
      ? menuPanel
      : mounted
        ? createPortal(menuPanel, document.body)
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
        className={`model-picker-trigger inline-flex items-center gap-1.5 rounded-full ${
          isComposer ? "px-3 text-xs leading-none" : pad
        } ${
          isComposer ? "in-composer h-11 sm:h-10" : "w-full"
        } ${variant === "glass" ? "on-glass" : ""} outline-none transition disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? modelLabel(selected) : emptyLabel}
        </span>
        {selected && variant !== "composer" ? (
          <ModelCapabilityBadges
            presentation="icons"
            vision={selected.vision}
            audio={selected.audio}
            video={selected.video}
            tools={selected.tools}
          />
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
