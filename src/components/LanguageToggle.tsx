"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/components/LocaleProvider";
import { LocaleFlag } from "@/components/LocaleFlag";
import {
  LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/locale";
import { useIsMounted } from "@/hooks/use-mounted";

type LanguageToggleProps = {
  size?: "sm" | "md";
  className?: string;
};

export const LanguageToggle = ({
  size = "md",
  className = "",
}: LanguageToggleProps) => {
  const { locale, setLocale, t } = useLocale();
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

  const buttonPad = size === "sm" ? "p-1.5" : "p-2";
  const flagClass = size === "sm" ? "h-[14px] w-[21px]" : "h-4 w-6";

  const handleSelect = (next: AppLocale) => {
    setLocale(next);
    setOpen(false);
  };

  const menu =
    mounted && open
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            className="theme-toggle-menu fixed z-[200] max-w-[calc(100vw-1rem)] min-w-[11rem] overflow-hidden rounded-xl p-1"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {LOCALES.map((id) => {
              const active = locale === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleSelect(id)}
                  className={`theme-toggle-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${
                    active ? "is-active" : ""
                  }`}
                >
                  <LocaleFlag locale={id} className="h-3.5 w-[21px]" />
                  <span className="flex-1">{LOCALE_LABELS[id]}</span>
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
        aria-label={t("common.chooseLanguage")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={t("common.languageTitle", { label: LOCALE_LABELS[locale] })}
      >
        <LocaleFlag locale={locale} className={flagClass} />
      </button>
      {menu}
    </div>
  );
};
