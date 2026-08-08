import { redirect } from "next/navigation";
import { ChatApp } from "@/components/ChatApp";
import { getCurrentUser } from "@/lib/auth";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatApp user={user} />;
}
