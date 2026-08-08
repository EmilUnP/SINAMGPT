import { redirect } from "next/navigation";
import { HomeTryChat } from "@/components/HomeTryChat";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/chat");
  return <HomeTryChat />;
}
