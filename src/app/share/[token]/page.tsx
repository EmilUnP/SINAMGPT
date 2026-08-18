import { redirect } from "next/navigation";
import { ShareUnavailable, SharedChatView } from "@/components/share";
import { getPageUser } from "@/lib/auth";
import { getSharedConversation, getSharedMessages } from "@/lib/share";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const user = await getPageUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/share/${token}`)}`);
  }

  const conversation = getSharedConversation(token);
  if (!conversation) {
    return <ShareUnavailable />;
  }

  const messages = getSharedMessages(conversation.id);

  return (
    <SharedChatView
      title={conversation.title}
      ownerUsername={conversation.owner_username}
      model={conversation.model}
      messages={messages}
      shareToken={token}
    />
  );
}
