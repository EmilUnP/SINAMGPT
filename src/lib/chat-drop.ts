import { isAllowedImageMime } from "@/lib/image-limits";

const IMAGE_NAME_RE = /\.(jpe?g|png|webp|gif)$/i;
const AUDIO_NAME_RE = /\.(wav|wave|mp3|m4a|aac|ogg|webm|flac)$/i;

export const dropHasFiles = (types: readonly string[] | undefined): boolean =>
  (types ?? []).includes("Files");

export const isDroppedImageFile = (file: File): boolean => {
  const type = file.type.trim().toLowerCase();
  if (type === "image/jpg" || isAllowedImageMime(type)) return true;
  if (type.startsWith("image/")) return false;
  return IMAGE_NAME_RE.test(file.name);
};

export const isDroppedAudioFile = (file: File): boolean => {
  const type = file.type.trim().toLowerCase();
  if (type.startsWith("audio/")) return true;
  return AUDIO_NAME_RE.test(file.name);
};
