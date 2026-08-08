"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/lib/ui";

type CopyButtonProps = {
  text: string;
  className?: string;
};

export const CopyButton = ({ text, className = "" }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${className}`}
      aria-label={copied ? "Copied" : "Copy message"}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};
