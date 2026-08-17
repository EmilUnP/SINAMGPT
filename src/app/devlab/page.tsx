import { redirect } from "next/navigation";
import { DevLab } from "@/components/devlab";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";

export default async function DevLabPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/devlab");
  if (user.role !== "admin") redirect("/chat");
  const features = getFeatureFlags();
  if (!features.devLab) redirect("/chat");
  return (
    <DevLab admin={user} developerApiEnabled={features.developerApi} />
  );
}
