import { redirect } from "next/navigation";
import { DeveloperConsole } from "@/components/developer/DeveloperConsole";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";

export default async function DeveloperPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/developer");
  const features = getFeatureFlags();
  if (!features.developerApi) redirect("/chat");
  return (
    <DeveloperConsole user={user} devLabEnabled={features.devLab} />
  );
}
