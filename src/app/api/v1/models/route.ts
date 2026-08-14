import {
  authenticateApiKey,
  getApiGatewaySettings,
  withApiCors,
} from "@/lib/api-keys";
import { getEnabledModels } from "@/lib/settings";

export async function OPTIONS(request: Request) {
  const settings = getApiGatewaySettings();
  return withApiCors(new Response(null, { status: 204 }), request, settings);
}

export async function GET(request: Request) {
  const settings = getApiGatewaySettings();
  const json = (body: unknown, status = 200) =>
    withApiCors(Response.json(body, { status }), request, settings);

  const auth = authenticateApiKey(request);
  if (!auth) {
    return json({ error: "Invalid or missing API key" }, 401);
  }
  if (!settings.enabled) {
    return json({ error: "API gateway is disabled" }, 503);
  }

  try {
    const { models, defaultModel } = await getEnabledModels();
    return json({
      models: models.map((m) => ({
        name: m.name,
        displayName: m.display_name,
        backend: m.backend,
      })),
      defaultModel,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load models";
    return json({ error: message, models: [] }, 503);
  }
}
