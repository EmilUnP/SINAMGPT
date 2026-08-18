import { redirect } from "next/navigation";
import { ModelsGuide } from "@/components/models";
import { getPageUser } from "@/lib/auth";
import { getEnabledModels } from "@/lib/settings";

export default async function ModelsPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/models");
  const { models, defaultModel } =
    await getEnabledModels();
  return (
    <ModelsGuide
      user={user}
      models={models}
      defaultModel={defaultModel}
    />
  );
}
