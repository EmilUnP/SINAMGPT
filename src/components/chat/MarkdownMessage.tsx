"use client";

import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

const ALLOWED_PROTOCOLS = /^(https?:|mailto:)/i;

const safeUrl = (url: string): string => {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  // Block javascript:, data:, vbscript:, etc.
  if (ALLOWED_PROTOCOLS.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  return "";
};

const components: Components = {
  a: ({ href, children, ...props }) => {
    const safe = href ? safeUrl(href) : "";
    if (!safe) {
      return <span {...props}>{children}</span>;
    }
    const external = /^https?:/i.test(safe);
    return (
      <a
        {...props}
        href={safe}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  },
  img: ({ alt }) =>
    alt ? (
      <span className="text-[var(--text-muted)]">[{alt}]</span>
    ) : null,
};

export const MarkdownMessage = memo(({ content }: MarkdownMessageProps) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
MarkdownMessage.displayName = "MarkdownMessage";
