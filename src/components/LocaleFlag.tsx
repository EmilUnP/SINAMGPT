import type { AppLocale } from "@/lib/locale";

type LocaleFlagProps = {
  locale: AppLocale;
  className?: string;
  title?: string;
};

/** Inline SVG flags — consistent on Windows where emoji flags often fail. */
export const LocaleFlag = ({
  locale,
  className = "",
  title,
}: LocaleFlagProps) => {
  if (locale === "az") {
    return (
      <svg
        viewBox="0 0 36 24"
        className={`shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        aria-label={title}
      >
        {title ? <title>{title}</title> : null}
        <rect width="36" height="8" y="0" fill="#00B5E2" />
        <rect width="36" height="8" y="8" fill="#EF3340" />
        <rect width="36" height="8" y="16" fill="#509E2F" />
        {/* Crescent */}
        <circle cx="15" cy="12" r="3.35" fill="#fff" />
        <circle cx="16.25" cy="12" r="2.7" fill="#EF3340" />
        {/* Eight-pointed star */}
        <polygon
          fill="#fff"
          transform="translate(20.55 12)"
          points="0,-1.85 .28,-.67 1.31,-1.31 .67,-.28 1.85,0 .67,.28 1.31,1.31 .28,.67 0,1.85 -.28,.67 -1.31,1.31 -.67,.28 -1.85,0 -.67,-.28 -1.31,-1.31 -.28,-.67"
        />
      </svg>
    );
  }

  if (locale === "ru") {
    return (
      <svg
        viewBox="0 0 36 24"
        className={`shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        aria-label={title}
      >
        {title ? <title>{title}</title> : null}
        <rect width="36" height="8" y="0" fill="#fff" />
        <rect width="36" height="8" y="8" fill="#0039A6" />
        <rect width="36" height="8" y="16" fill="#D52B1E" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 36 24"
      className={`shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <rect width="36" height="24" fill="#012169" />
      <path d="M0 0 L36 24 M36 0 L0 24" stroke="#fff" strokeWidth="4.8" />
      <path d="M0 0 L36 24 M36 0 L0 24" stroke="#C8102E" strokeWidth="3" />
      <path d="M18 0 V24 M0 12 H36" stroke="#fff" strokeWidth="8" />
      <path d="M18 0 V24 M0 12 H36" stroke="#C8102E" strokeWidth="4.8" />
    </svg>
  );
};
