import { redirect } from "next/navigation";
import { HomeTryChat } from "@/components/chat";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";

export default async function HomePage() {
  const user = await getPageUser();
  if (user) redirect("/chat");
  return <HomeTryChat features={getFeatureFlags()} />;
}
