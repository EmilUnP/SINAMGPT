import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getMessageAttachmentContext,
  readAttachmentFile,
} from "@/lib/attachments";

type Params = { params: Promise<{ messageId: string; index: string }> };

export async function GET(_request: Request, { params }: Params) {
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
  const isShared = Boolean(ctx.shareToken);
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

  const filename = attachment.name.replace(/["\r\n]+/g, "_");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": attachment.mime,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
