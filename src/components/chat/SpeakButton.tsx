"use client";

import { useEffect, useRef, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { browserCanSpeak, speakText, stripForSpeech } from "@/lib/speak";

type SpeakButtonProps = {
  text: string;
  enabled: boolean;
  className?: string;
};

export const SpeakButton = ({
  text,
  enabled,
  className = "",
}: SpeakButtonProps) => {
  const { locale, t } = useLocale();
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [],
  );

  if (!enabled) return null;

  const handleClick = () => {
    if (playing) {
      stopRef.current?.();
      stopRef.current = null;
      setPlaying(false);
      return;
    }
    const spoken = stripForSpeech(text);
    if (!spoken || !browserCanSpeak()) return;
    setPlaying(true);
    stopRef.current = speakText(spoken, locale, {
      onend: () => {
        setPlaying(false);
        stopRef.current = null;
      },
      onerror: () => {
        setPlaying(false);
        stopRef.current = null;
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition ${className}`}
      aria-label={playing ? t("chat.stopListening") : t("chat.listenReply")}
      title={
        browserCanSpeak() ? undefined : t("chat.listenUnavailable")
      }
    >
      {playing ? <Square size={12} fill="currentColor" /> : <Volume2 size={12} />}
      {playing ? t("chat.stopListening") : t("chat.listenReply")}
    </button>
  );
};
