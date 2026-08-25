import { z } from "zod";
import { MAX_CHAT_IMAGES, type IncomingImage } from "@/lib/attachments";
import {
  apiV1Options,
  authenticateGateway,
  jsonWithCors,
  parseDataImageUrl,
  promptFromMessages,
  rejectGateway,
  resolveGatewayModel,
  runGatewayGenerate,
  toChatMessages,
  type GatewayIncomingMessage,
} from "@/lib/api-v1";

const imageSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(32).max(16_000_000),
  name: z.string().trim().max(200).optional(),
});

const contentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string().max(32000),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.union([
      z.string().min(32).max(16_000_000),
      z.object({ url: z.string().min(32).max(16_000_000) }),
    ]),
  }),
]);

const schema = z
  .object({
    model: z.string().trim().min(1).max(120).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z
            .union([
              z.string().max(32000),
              z.array(contentPartSchema).min(1).max(24),
            ])
            .optional(),
          images: z.array(imageSchema).max(MAX_CHAT_IMAGES).optional(),
        }),
      )
      .min(1)
      .max(40),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(8192).optional(),
    max_completion_tokens: z.number().int().min(1).max(8192).optional(),
    top_p: z.number().min(0.05).max(1).optional(),
    stream_options: z
      .object({ include_usage: z.boolean().optional() })
      .optional(),
  });

const flattenMessage = (
  row: z.infer<typeof schema>["messages"][number],
): GatewayIncomingMessage | { error: string } => {
  const images: IncomingImage[] = [...(row.images ?? [])];
  let text = "";
  const content = row.content;

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text") {
        text += (text ? "\n" : "") + part.text;
        continue;
      }
      const url =
        typeof part.image_url === "string"
          ? part.image_url
          : part.image_url.url;
      const parsed = parseDataImageUrl(url);
      if ("error" in parsed) return parsed;
      images.push(parsed);
    }
  }

  return { role: row.role, content: text, ...(images.length ? { images } : {}) };
};

// Numeric literal required; Next.js cannot analyze imported constants.
export const maxDuration = 300;

export async function OPTIONS(request: Request) {
  return apiV1Options(request);
}

export async function POST(request: Request) {
  const gate = authenticateGateway(request, "openai");
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
        "openai",
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
      "openai",
    );
  }

  const incoming: GatewayIncomingMessage[] = [];
  for (const row of parsedBody.messages) {
    const flat = flattenMessage(row);
    if ("error" in flat) {
      return rejectGateway(
        request,
        gate.auth,
        gate.ip,
        flat.error,
        400,
        "openai",
      );
    }
    incoming.push(flat);
  }

  const hasPayload = incoming.some(
    (m) => m.content.trim() || (m.images?.length ?? 0) > 0,
  );
  if (!hasPayload) {
    return rejectGateway(
      request,
      gate.auth,
      gate.ip,
      "At least one message with text or images is required",
      400,
      "openai",
    );
  }

  let model: string;
  try {
    model = await resolveGatewayModel(parsedBody.model);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve model";
    return jsonWithCors(
      request,
      { error: { message, type: "api_error" } },
      503,
    );
  }

  const converted = toChatMessages(incoming);
  if (converted.error) {
    return rejectGateway(
      request,
      gate.auth,
      gate.ip,
      converted.error,
      400,
      "openai",
      { model },
    );
  }

  return runGatewayGenerate(
    request,
    gate,
    {
      model,
      messages: converted.messages,
      stream: Boolean(parsedBody.stream),
      hasImages: converted.hasImages,
      prompt: promptFromMessages(converted.messages),
      temperature: parsedBody.temperature,
      maxTokens: parsedBody.max_completion_tokens ?? parsedBody.max_tokens,
      topP: parsedBody.top_p,
      includeUsage: parsedBody.stream_options?.include_usage === true,
    },
    "openai",
  );
}
