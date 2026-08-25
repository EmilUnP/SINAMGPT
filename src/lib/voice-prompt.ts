import { catalogs } from "@/messages";

/** Default line we send with a mic clip so the model transcribes it. Hide it in the bubble. */
export const isCannedVoicePrompt = (text: string): boolean => {
  const value = text.trim();
  if (!value) return false;
  return (
    value === catalogs.en.chat.audioDefaultPrompt ||
    value === catalogs.az.chat.audioDefaultPrompt ||
    value === catalogs.ru.chat.audioDefaultPrompt
  );
};
