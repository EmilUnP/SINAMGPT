import { LOCALE_BCP47, type AppLocale } from "@/lib/locale";

export const browserCanSpeak = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Turn a chat reply into something a TTS engine can read. */
export const stripForSpeech = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pickVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  const voices = window.speechSynthesis.getVoices();
  const want = lang.toLowerCase();
  const prefix = want.slice(0, 2);
  return (
    voices.find((voice) => voice.lang.toLowerCase() === want) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix))
  );
};

type SpeakHandlers = {
  onend?: () => void;
  onerror?: () => void;
};

/** Speak text in the UI language. Returns a stop function. */
export const speakText = (
  text: string,
  locale: AppLocale,
  handlers: SpeakHandlers = {},
): (() => void) => {
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = LOCALE_BCP47[locale];
  const voice = pickVoice(utter.lang);
  if (voice) utter.voice = voice;
  utter.onend = () => handlers.onend?.();
  utter.onerror = () => handlers.onerror?.();
  const timer = window.setTimeout(() => {
    window.speechSynthesis.speak(utter);
  }, 40);
  return () => {
    window.clearTimeout(timer);
    window.speechSynthesis.cancel();
  };
};
