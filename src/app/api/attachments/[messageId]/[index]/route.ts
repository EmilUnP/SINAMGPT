import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getMessageAttachmentContext,
  readAttachmentFile,
} from "@/lib/attachments";

type Params = { params: Promise<{ messageId: string; index: string }> };

const tokensEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
};

const parseByteRange = (
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return "invalid";
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return "invalid";
  let start = hasStart ? Number.parseInt(match[1], 10) : size - Number.parseInt(match[2], 10);
  let end = hasEnd ? Number.parseInt(match[2], 10) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return "invalid";
  if (!hasStart) start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start < 0 || start >= size || end < start) return "invalid";
  return { start, end };
};

export async function GET(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, index: indexRaw } = await params;
  const index = Number.parseInt(indexRaw, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ctx = getMessageAttachmentContext(messageId);
  if (!ctx) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = ctx.userId === user.id;
  const presented = new URL(request.url).searchParams.get("share")?.trim() ?? "";
  const isShared =
    Boolean(ctx.shareToken) &&
    presented.length >= 8 &&
    presented.length <= 80 &&
    tokensEqual(presented, ctx.shareToken ?? "");
  if (!isOwner && !isShared) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const attachment = ctx.attachments.find((item) => item.index === index);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = readAttachmentFile(ctx.conversationId, messageId, attachment);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(file);
  const size = bytes.byteLength;
  const filename = attachment.name.replace(/["\r\n]+/g, "_");
  const baseHeaders: Record<string, string> = {
    "Content-Type": attachment.mime,
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${size}`,
      },
    });
  }

  if (range) {
    const slice = bytes.subarray(range.start, range.end + 1);
    return new NextResponse(slice, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(slice.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  return new NextResponse(bytes, {
    headers: {
      ...baseHeaders,
      "Content-Length": String(size),
    },
  });
};
