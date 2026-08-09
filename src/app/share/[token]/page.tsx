import { redirect } from "next/navigation";
import { SharedChatView } from "@/components/SharedChatView";
import { getCurrentUser } from "@/lib/auth";
import { getSharedConversation, getSharedMessages } from "@/lib/share";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/share/${token}`)}`);
  }

  const conversation = getSharedConversation(token);
  if (!conversation) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)] px-6 text-center text-[var(--text)]">
        <h1 className="text-xl font-semibold">Share link unavailable</h1>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          This link was revoked or never existed. Ask your colleague for a new
          share link.
        </p>
        <a
          href="/chat"
          className="mt-2 text-sm text-[var(--accent)] hover:underline"
        >
          Back to chat
        </a>
      </div>
    );
  }

  const messages = getSharedMessages(conversation.id);

  return (
    <SharedChatView
      title={conversation.title}
      ownerUsername={conversation.owner_username}
      model={conversation.model}
      messages={messages}
    />
  );
}
