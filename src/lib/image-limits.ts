export const MAX_CHAT_IMAGES = 4;
export const MAX_GUEST_IMAGES = 2;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const isAllowedImageMime = (value: string): value is AllowedImageMime =>
  (ALLOWED_IMAGE_MIMES as readonly string[]).includes(value);

export const attachmentUrl = (
  messageId: string,
  index: number,
  shareToken?: string | null,
): string => {
  const path = `/api/attachments/${encodeURIComponent(messageId)}/${index}`;
  if (!shareToken) return path;
  return `${path}?share=${encodeURIComponent(shareToken)}`;
};
