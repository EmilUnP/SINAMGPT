"use client";

import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useTranslations } from "@/components/LocaleProvider";
import { useIsMounted } from "@/hooks/use-mounted";

export type OverflowNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type OverflowNavProps = {
  items: OverflowNavItem[];
  className?: string;
};

export const OverflowNav = ({ items, className = "" }: OverflowNavProps) => {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const mounted = useIsMounted();
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

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

  if (items.length === 0) return null;

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="menu-surface fixed z-[200] min-w-[12rem] overflow-hidden rounded-xl p-1"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="menu-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm sm:py-2"
              >
                <Icon size={15} strokeWidth={1.85} />
                <span className="flex-1">{label}</span>
              </Link>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="theme-toggle-btn inline-flex items-center justify-center rounded-full p-2"
        aria-label={t("common.moreMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t("common.more")}
      >
        <MoreHorizontal size={16} strokeWidth={1.85} />
      </button>
      {menu}
    </div>
  );
};
