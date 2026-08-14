import { redirect } from "next/navigation";
import { DeveloperConsole } from "@/components/developer";
import { getPageUser } from "@/lib/auth";

export default async function DeveloperPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/developer");
  return <DeveloperConsole user={user} />;
}
