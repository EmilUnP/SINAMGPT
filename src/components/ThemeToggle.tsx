"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const options: Array<{
  id: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

type ThemeToggleProps = {
  size?: "sm" | "md";
  className?: string;
};

export const ThemeToggle = ({
  size = "md",
  className = "",
}: ThemeToggleProps) => {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPos = () => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onResize = () => updateMenuPos();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ActiveIcon =
    preference === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const buttonPad = size === "sm" ? "p-1.5" : "p-2";
  const iconSize = size === "sm" ? 15 : 16;

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="theme-toggle-menu fixed z-[200] min-w-[10rem] overflow-hidden rounded-xl p-1"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {options.map(({ id, label, icon: Icon }) => {
              const active = preference === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setPreference(id);
                    setOpen(false);
                  }}
                  className={`theme-toggle-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                    active ? "is-active" : ""
                  }`}
                >
                  <Icon size={15} strokeWidth={1.85} />
                  <span className="flex-1">{label}</span>
                  {active ? (
                    <span className="theme-toggle-dot" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`theme-toggle-btn inline-flex items-center justify-center rounded-full ${buttonPad}`}
        aria-label="Choose theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={`Theme: ${preference}`}
      >
        <ActiveIcon size={iconSize} strokeWidth={1.85} />
      </button>
      {menu}
    </div>
  );
};
