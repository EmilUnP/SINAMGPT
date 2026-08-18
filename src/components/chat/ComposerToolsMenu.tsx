"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Plus, X, type LucideIcon } from "lucide-react";

export type ComposerToolItem = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
};

export type ComposerToolSection = {
  id: string;
  items: ComposerToolItem[];
};

type ComposerToolsMenuProps = {
  sections: ComposerToolSection[];
  disabled?: boolean;
  ariaLabel: string;
  closeLabel: string;
  footer?: ReactNode;
};

export const ComposerToolsMenu = ({
  sections,
  disabled = false,
  ariaLabel,
  closeLabel,
  footer,
}: ComposerToolsMenuProps) => {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const flatItems = sections.flatMap((section) => section.items);
  const enabledIndexes = flatItems
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const indexedSections = sections.map((section, sectionIndex) => {
    const start = sections
      .slice(0, sectionIndex)
      .reduce((sum, current) => sum + current.items.length, 0);
    return {
      ...section,
      items: section.items.map((item, offset) => ({
        item,
        index: start + offset,
      })),
    };
  });

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

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openMenu = () => {
    if (disabled) return;
    const first = enabledIndexes[0] ?? 0;
    setFocusedIndex(first);
    setOpen(true);
  };

  const commit = (index: number) => {
    const item = flatItems[index];
    if (!item || item.disabled) return;
    item.onSelect();
    closeMenu();
  };

  const moveFocus = (dir: 1 | -1) => {
    if (!enabledIndexes.length) return;
    const posInEnabled = enabledIndexes.indexOf(focusedIndex);
    const start = posInEnabled >= 0 ? posInEnabled : dir === 1 ? -1 : 0;
    const next =
      enabledIndexes[(start + dir + enabledIndexes.length) % enabledIndexes.length];
    setFocusedIndex(next);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent) => {
    if (disabled) return;
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setFocusedIndex(enabledIndexes[0] ?? 0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setFocusedIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        commit(focusedIndex);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // enabledIndexes is derived from sections; focusedIndex must stay current.
  }, [open, focusedIndex, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={open ? closeLabel : ariaLabel}
        title={open ? closeLabel : ariaLabel}
        className={`touch-target mb-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full transition disabled:opacity-40 sm:h-10 sm:w-10 ${
          open
            ? "bg-[var(--text)] text-[var(--bg)]"
            : "text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
        }`}
      >
        {open ? <X size={16} /> : <Plus size={16} />}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={listId}
          role="menu"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="menu-surface absolute bottom-full left-0 z-50 mb-2 max-h-80 min-w-[16rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-1.5"
        >
          {indexedSections.map((section, sectionIndex) => (
            <div
              key={section.id}
              className={
                sectionIndex > 0
                  ? "mt-1 border-t border-[var(--border)] pt-1"
                  : ""
              }
            >
              {section.items.map(({ item, index }) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    aria-disabled={item.disabled || undefined}
                    onClick={() => commit(index)}
                    onMouseEnter={() => {
                      if (!item.disabled) setFocusedIndex(index);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left ${
                      item.disabled
                        ? "cursor-not-allowed opacity-45"
                        : `menu-item ${index === focusedIndex ? "is-focused" : ""}`
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hover)] text-[var(--text)]">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--text)]">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                        {item.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {footer ? (
            <div className="mt-1 border-t border-[var(--border)] pt-1">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
