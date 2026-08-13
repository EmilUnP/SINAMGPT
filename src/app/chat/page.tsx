import { redirect } from "next/navigation";
import { ChatApp } from "@/components/chat";
import { getPageUser } from "@/lib/auth";

export default async function ChatPage() {
  const user = await getPageUser();
  if (!user) redirect("/login");
  return <ChatApp user={user} />;
}
