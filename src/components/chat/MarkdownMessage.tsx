"use client";

import { isValidElement, memo, useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "@/components/LocaleProvider";
import { copyText } from "@/lib/ui";
import type { KnowledgeCitation } from "@/lib/types";
import {
  CITATION_TITLE_PREFIX,
  citationUrls,
  linkCitations,
} from "./citation-links";

type MarkdownMessageProps = {
  content: string;
  /** Web sources of this reply; "[n]" in the text links to source n. */
  sources?: KnowledgeCitation[] | null;
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

/** Flatten a fenced block's children back into the raw source text to copy. */
const textOf = (node: ReactNode): string => {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
};

/** `language-ts` on the inner <code> is how remark labels a fenced block. */
const languageOf = (node: ReactNode): string => {
  if (!isValidElement(node)) return "";
  const className = (node.props as { className?: string }).className ?? "";
  return /language-([\w+-]+)/.exec(className)?.[1] ?? "";
};

const CodeBlock = ({ children }: { children?: ReactNode }) => {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const language = languageOf(children);
  const source = textOf(children);

  const handleCopy = async () => {
    if (!(await copyText(source))) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="markdown-code">
      <div className="markdown-code-bar">
        <span>{language || "text"}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="markdown-code-copy"
          aria-label={copied ? t("common.copied") : t("common.copy")}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? t("common.copied") : t("common.copy")}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
};

const components: Components = {
  a: ({ href, children, title, ...props }) => {
    const safe = href ? safeUrl(href) : "";
    if (!safe) {
      return <span {...props}>{children}</span>;
    }
    if (title?.startsWith(CITATION_TITLE_PREFIX) && /^https?:/i.test(safe)) {
      let host = safe;
      try {
        host = new URL(safe).hostname.replace(/^www\./, "");
      } catch {
        // keep the URL as the tooltip
      }
      return (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
          title={host}
          className="markdown-cite"
        >
          {children}
        </a>
      );
    }
    const external = /^https?:/i.test(safe);
    return (
      <a
        {...props}
        title={title}
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  // A wide table has to scroll inside itself, or it pushes the whole bubble
  // sideways on a phone.
  table: ({ children, ...props }) => (
    <div className="markdown-table-scroll">
      <table {...props}>{children}</table>
    </div>
  ),
};

export const MarkdownMessage = memo(({ content, sources }: MarkdownMessageProps) => {
  const text = useMemo(
    () => linkCitations(content, citationUrls(sources)),
    [content, sources],
  );
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
MarkdownMessage.displayName = "MarkdownMessage";
