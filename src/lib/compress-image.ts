import {
  MAX_IMAGE_BYTES,
  isAllowedImageMime,
  type AllowedImageMime,
} from "@/lib/image-limits";

export type ChatImagePayload = {
  mime: AllowedImageMime;
  data: string;
  name: string;
};

export type CompressImageResult =
  | { ok: true; image: ChatImagePayload }
  | { ok: false; code: "type" | "size" | "failed" };

const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.82;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

const dataUrlToBase64 = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
};

const safeName = (name: string, fallback: string): string => {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return cleaned || fallback;
};

const mimeFromFile = (file: File): AllowedImageMime | null => {
  const type = file.type.trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  if (isAllowedImageMime(type)) return type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return null;
};

export const fileToChatImage = async (
  file: File,
): Promise<CompressImageResult> => {
  const type = mimeFromFile(file);
  if (!type) return { ok: false, code: "type" };

  if (type === "image/gif") {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, code: "size" };
    try {
      const dataUrl = await readAsDataUrl(file);
      return {
        ok: true,
        image: {
          mime: "image/gif",
          data: dataUrlToBase64(dataUrl),
          name: safeName(file.name, "image.gif"),
        },
      };
    } catch {
      return { ok: false, code: "failed" };
    }
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { ok: false, code: "failed" };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const data = dataUrlToBase64(dataUrl);
    if (data.length * 0.75 > MAX_IMAGE_BYTES) return { ok: false, code: "size" };
    const base = file.name.replace(/\.[^.]+$/, "");
    return {
      ok: true,
      image: {
        mime: "image/jpeg",
        data,
        name: safeName(`${base || "image"}.jpg`, "image.jpg"),
      },
    };
  } catch {
    return { ok: false, code: "failed" };
  }
};

export const imagePreviewUrl = (image: ChatImagePayload): string =>
  `data:${image.mime};base64,${image.data}`;
