import { z } from "zod";
import { MAX_CHAT_IMAGES } from "@/lib/attachments";
import {
  API_V1_MAX_DURATION,
  apiV1Options,
  authenticateGateway,
  jsonWithCors,
  promptFromMessages,
  rejectGateway,
  resolveGatewayModel,
  runGatewayGenerate,
  toChatMessages,
} from "@/lib/api-v1";

const imageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(32).max(16_000_000),
  name: z.string().trim().max(200).optional(),
});

const schema = z
  .object({
    model: z.string().trim().min(1).max(120).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string().max(32000).optional().default(""),
          images: z.array(imageSchema).max(MAX_CHAT_IMAGES).optional(),
        }),
      )
      .min(1)
      .max(40),
    stream: z.boolean().optional().default(true),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(8192).optional(),
    top_p: z.number().min(0.05).max(1).optional(),
  })
  .superRefine((data, ctx) => {
    const hasPayload = data.messages.some(
      (m) => m.content.trim() || (m.images?.length ?? 0) > 0,
    );
    if (!hasPayload) {
      ctx.addIssue({
        code: "custom",
        message: "At least one message with text or images is required",
        path: ["messages"],
      });
    }
  });

export const maxDuration = API_V1_MAX_DURATION;

export async function OPTIONS(request: Request) {
  return apiV1Options(request);
}

export async function POST(request: Request) {
  const gate = authenticateGateway(request, "sinam");
  if (!gate.ok) return gate.response;

  let parsedBody: z.infer<typeof schema>;
  try {
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return rejectGateway(
        request,
        gate.auth,
        gate.ip,
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
        "sinam",
      );
    }
    parsedBody = parsed.data;
  } catch {
    return rejectGateway(
      request,
      gate.auth,
      gate.ip,
      "Invalid JSON body",
      400,
      "sinam",
    );
  }

  let model: string;
  try {
    model = await resolveGatewayModel(parsedBody.model);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve model";
    return jsonWithCors(request, { error: message }, 503);
  }

  const converted = toChatMessages(parsedBody.messages);
  if (converted.error) {
    return rejectGateway(
      request,
      gate.auth,
      gate.ip,
      converted.error,
      400,
      "sinam",
      { model },
    );
  }

  return runGatewayGenerate(
    request,
    gate,
    {
      model,
      messages: converted.messages,
      stream: parsedBody.stream,
      hasImages: converted.hasImages,
      prompt: promptFromMessages(converted.messages),
      temperature: parsedBody.temperature,
      maxTokens: parsedBody.max_tokens,
      topP: parsedBody.top_p,
    },
    "sinam",
  );
}
