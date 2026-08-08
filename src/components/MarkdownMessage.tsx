"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownMessageProps = {
  content: string;
};

export const MarkdownMessage = ({ content }: MarkdownMessageProps) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};
