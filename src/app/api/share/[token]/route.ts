import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSharedConversation, getSharedMessages } from "@/lib/share";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const conversation = getSharedConversation(token);
  if (!conversation) {
    return NextResponse.json(
      { error: "Share link not found or revoked" },
      { status: 404 },
    );
  }

  const messages = getSharedMessages(conversation.id);
  return NextResponse.json({
    conversation,
    messages,
    viewer: { id: user.id, username: user.username },
  });
}
