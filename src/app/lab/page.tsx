import { redirect } from "next/navigation";
import { ModelLab } from "@/components/lab/ModelLab";
import { getPageUser } from "@/lib/auth";
import { getFeatureFlags } from "@/lib/features";

export default async function LabPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/lab");
  if (user.role !== "admin") redirect("/chat");
  return (
    <ModelLab admin={user} devLabEnabled={getFeatureFlags().devLab} />
  );
}
