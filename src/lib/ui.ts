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

export const relativeTime = (value: string): string => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

/** Chat bubble timestamp, e.g. "7:23 PM" or "Aug 8, 7:23 PM" if not today. */
export const formatChatTime = (value?: string | null): string => {
  if (!value) return "";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) return time;

  const day = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${time}`;
};
