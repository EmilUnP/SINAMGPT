import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";

export default async function ChatPage() {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return <ChatApp user={user} features={getFeatureFlags()} />;
}
