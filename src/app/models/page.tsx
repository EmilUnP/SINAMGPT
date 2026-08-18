import { ModelsGuide } from "@/components/models";
import { getPageUser } from "@/lib/auth";
import { getEnabledModels } from "@/lib/settings";

export default async function ModelsPage() {
  const user = await getPageUser();
  let models: Awaited<ReturnType<typeof getEnabledModels>>["models"] = [];
  let defaultModel = "";
  try {
    const enabled = await getEnabledModels();
    models = enabled.models;
    defaultModel = enabled.defaultModel;
  } catch {
    // Public catalog still renders if Ollama is briefly unreachable.
  }

  return (
    <ModelsGuide
      signedIn={Boolean(user)}
      models={models}
      defaultModel={defaultModel}
    />
  );
}
