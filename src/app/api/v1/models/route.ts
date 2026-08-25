import {
  apiV1Options,
  authenticateGateway,
  jsonWithCors,
  listGatewayModels,
} from "@/lib/api-v1";

export async function OPTIONS(request: Request) {
  return apiV1Options(request);
}

export async function GET(request: Request) {
  const gate = authenticateGateway(request, "openai", { rateLimit: false });
  if (!gate.ok) return gate.response;

  try {
    const catalog = await listGatewayModels();
    return jsonWithCors(request, catalog);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load models";
    return jsonWithCors(
      request,
      {
        error: { message, type: "api_error" },
        object: "list",
        data: [],
        models: [],
      },
      503,
    );
  }
}
