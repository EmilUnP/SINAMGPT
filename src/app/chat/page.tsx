import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";
import { isWebSearchEnabled } from "@/lib/search/settings";

export default async function ChatPage() {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return (
    <ChatApp
      user={user}
      features={{ ...getFeatureFlags(), webSearch: isWebSearchEnabled() }}
    />
  );
}
