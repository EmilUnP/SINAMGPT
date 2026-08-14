import type { AppLocale } from "@/lib/locale";
import { translate } from "@/messages";

export const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
};

export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const bcp47 = (locale: AppLocale = "en"): string =>
  locale === "az" ? "az-AZ" : "en-US";

export const relativeTime = (
  value: string,
  locale: AppLocale = "en",
): string => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return translate(locale, "common.justNow");
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return translate(locale, "common.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return translate(locale, "common.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return translate(locale, "common.daysAgo", { n: days });
  return date.toLocaleDateString(bcp47(locale));
};

/** Chat bubble timestamp, e.g. "7:23 PM" or "Aug 8, 7:23 PM" if not today. */
export const formatChatTime = (
  value?: string | null,
  locale: AppLocale = "en",
): string => {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const tag = bcp47(locale);
  const time = date.toLocaleTimeString(tag, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) return time;

  const day = date.toLocaleDateString(tag, {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${time}`;
};

export const formatDateTime = (
  value: string | null | undefined,
  locale: AppLocale = "en",
): string => {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(bcp47(locale));
};

export const usageStatusLabel = (
  status: string,
  locale: AppLocale = "en",
): string => {
  if (status === "ok") return translate(locale, "common.statusOk");
  if (status === "error") return translate(locale, "common.statusError");
  if (status === "aborted") return translate(locale, "common.statusAborted");
  if (status === "rejected") return translate(locale, "common.statusRejected");
  return status;
};
