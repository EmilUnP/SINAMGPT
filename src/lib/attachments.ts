import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import {
  MAX_CHAT_IMAGES,
  MAX_IMAGE_BYTES,
  isAllowedImageMime,
  type AllowedImageMime,
} from "@/lib/image-limits";
import type { Message, MessageAttachment } from "@/lib/types";

export {
  ALLOWED_IMAGE_MIMES,
  MAX_CHAT_IMAGES,
  MAX_GUEST_IMAGES,
  MAX_IMAGE_BYTES,
  type AllowedImageMime,
} from "@/lib/image-limits";

export type IncomingImage = {
  mime: string;
  data: string;
  name?: string;
};

const EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const attachmentsRoot = () =>
  path.join(process.cwd(), "data", "attachments");

export const stripBase64Prefix = (raw: string): string => {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(",");
  if (trimmed.startsWith("data:") && comma >= 0) {
    return trimmed.slice(comma + 1);
  }
  return trimmed.replace(/\s/g, "");
};

export const decodeImageData = (
  incoming: IncomingImage,
): { mime: AllowedImageMime; buffer: Buffer; name: string } | { error: string } => {
  const mime = incoming.mime.trim().toLowerCase();
  if (!isAllowedImageMime(mime)) {
    return { error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." };
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(stripBase64Prefix(incoming.data), "base64");
  } catch {
    return { error: "Invalid image data" };
  }
  if (!buffer.length) return { error: "Invalid image data" };
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { error: `Each image must be under ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.` };
  }
  const name = (incoming.name || "image").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return { mime, buffer, name: name || "image" };
};

export const parseAttachments = (raw: string | null | undefined): MessageAttachment[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MessageAttachment => {
      if (!item || typeof item !== "object") return false;
      const row = item as MessageAttachment;
      return (
        row.type === "image" &&
        typeof row.mime === "string" &&
        isAllowedImageMime(row.mime) &&
        typeof row.name === "string" &&
        Number.isInteger(row.index) &&
        row.index >= 0
      );
    });
  } catch {
    return [];
  }
};

const filePathFor = (
  conversationId: string,
  messageId: string,
  index: number,
  mime: string,
) =>
  path.join(
    attachmentsRoot(),
    conversationId,
    messageId,
    `${index}.${isAllowedImageMime(mime) ? EXT[mime] : "jpg"}`,
  );

export const saveMessageImages = (
  conversationId: string,
  messageId: string,
  images: IncomingImage[],
): { attachments: MessageAttachment[]; error?: string } => {
  if (!images.length) return { attachments: [] };
  if (images.length > MAX_CHAT_IMAGES) {
    return {
      attachments: [],
      error: `You can attach up to ${MAX_CHAT_IMAGES} images.`,
    };
  }

  const decoded: Array<{
    mime: AllowedImageMime;
    buffer: Buffer;
    name: string;
  }> = [];
  for (const image of images) {
    const result = decodeImageData(image);
    if ("error" in result) return { attachments: [], error: result.error };
    decoded.push(result);
  }

  const dir = path.join(attachmentsRoot(), conversationId, messageId);
  mkdirSync(dir, { recursive: true });

  const attachments: MessageAttachment[] = decoded.map((item, index) => {
    writeFileSync(filePathFor(conversationId, messageId, index, item.mime), item.buffer);
    return {
      type: "image",
      mime: item.mime,
      name: item.name,
      index,
    };
  });

  return { attachments };
};

export const loadMessageImageBuffers = (
  conversationId: string,
  messageId: string,
  attachments: MessageAttachment[],
): string[] => {
  const out: string[] = [];
  for (const item of attachments) {
    try {
      const buf = readFileSync(
        filePathFor(conversationId, messageId, item.index, item.mime),
      );
      out.push(buf.toString("base64"));
    } catch {
      // skip missing files
    }
  }
  return out;
};

export const readAttachmentFile = (
  conversationId: string,
  messageId: string,
  attachment: MessageAttachment,
): Buffer | null => {
  try {
    return readFileSync(
      filePathFor(conversationId, messageId, attachment.index, attachment.mime),
    );
  } catch {
    return null;
  }
};

export const deleteConversationAttachments = (conversationId: string) => {
  try {
    rmSync(path.join(attachmentsRoot(), conversationId), {
      recursive: true,
      force: true,
    });
  } catch {
    // ignore
  }
};

export const hydrateUiMessage = (row: {
  id: string;
  conversation_id: string;
  role: Message["role"];
  content: string;
  sources: string | null;
  attachments?: string | null;
  created_at: string;
}): Message => {
  let sources: Message["sources"] = null;
  if (row.sources) {
    try {
      const parsed = JSON.parse(row.sources) as Message["sources"];
      if (Array.isArray(parsed) && parsed.length) sources = parsed;
    } catch {
      sources = null;
    }
  }
  const attachments = parseAttachments(row.attachments);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
    sources,
    attachments: attachments.length ? attachments : null,
  };
};

export const toLlmHistory = (
  conversationId: string,
  rows: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: string | null;
  }>,
) =>
  rows.map((row) => {
    const attachments = parseAttachments(row.attachments);
    const images =
      row.role === "user" && attachments.length
        ? loadMessageImageBuffers(conversationId, row.id, attachments)
        : [];
    return {
      role: row.role,
      content: row.content,
      ...(images.length ? { images } : {}),
    };
  });

export const getMessageAttachmentContext = (
  messageId: string,
): {
  conversationId: string;
  userId: string;
  shareToken: string | null;
  attachments: MessageAttachment[];
} | null => {
  const row = getDb()
    .prepare(
      `SELECT m.attachments, c.id AS conversation_id, c.user_id, c.share_token
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ?`,
    )
    .get(messageId) as
    | {
        attachments: string | null;
        conversation_id: string;
        user_id: string;
        share_token: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    shareToken: row.share_token,
    attachments: parseAttachments(row.attachments),
  };
};
