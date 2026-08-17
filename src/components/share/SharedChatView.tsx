"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Lock, UserRound } from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import { KnowledgeCitations } from "@/components/chat/KnowledgeCitations";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { MessageImages } from "@/components/chat/MessageImages";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { attachmentUrl } from "@/lib/image-limits";
import type { Message } from "@/lib/types";

type SharedChatViewProps = {
  title: string;
  ownerUsername: string;
  model: string;
  messages: Message[];
};

export const SharedChatView = ({
  title,
  ownerUsername,
  model,
  messages,
}: SharedChatViewProps) => {
  const t = useTranslations();

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="page-chrome safe-x flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
        <Link
          href="/chat"
          className="touch-target inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          aria-label={t("share.back")}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">{t("share.back")}</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Image
            src={sinamLogo}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full"
            style={{ width: "auto", height: "auto" }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold md:text-base">
              {title}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Lock size={11} />
                {t("share.sharedReadOnly")}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound size={11} />
                {ownerUsername}
              </span>
              <span className="truncate max-w-[8rem] sm:max-w-none sm:inline">{model}</span>
            </p>
          </div>
        </div>
        <LanguageToggle size="sm" />
        <ThemeToggle size="sm" />
      </header>

      <div className="safe-bottom chat-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
          {messages.length === 0 ? (
            <p className="text-center text-sm text-[var(--text-muted)]">
              {t("share.empty")}
            </p>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[min(100%,42rem)] sm:max-w-[92%] md:max-w-[85%] ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white"
                          : "border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]"
                      }`}
                    >
                      {isUser ? (
                        <div className="space-y-2">
                          <MessageImages
                            items={
                              message.attachments?.map((item) => ({
                                src: attachmentUrl(message.id, item.index),
                                name: item.name,
                              })) ?? []
                            }
                          />
                          {message.content ? (
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <MarkdownMessage content={message.content} />
                      )}
                    </div>
                    {!isUser ? (
                      <KnowledgeCitations sources={message.sources} />
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
