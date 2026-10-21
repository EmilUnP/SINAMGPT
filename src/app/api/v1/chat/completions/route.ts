import { z } from "zod";
import { type IncomingImage } from "@/lib/attachments";
import { chatCompletionSchema as schema } from "@/lib/api-chat-input";
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

  return {
    role: row.role === "developer" ? "system" : row.role,
    content: text, ...(images.length ? { images } : {}),
    ...(row.tool_calls?.length ? { toolCalls: row.tool_calls.map((call) => ({
      id: call.id, name: call.function.name, arguments: call.function.arguments,
    })) } : {}),
    ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
    ...(row.name ? { toolName: row.name } : {}),
    ...(row.reasoning_content ? { reasoningContent: row.reasoning_content } : {}),
  };
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
      // Name the field: "messages.3.tool_calls: Too small" is debuggable from a
      // client's error box; "Too small" alone is not.
      const first = parsed.error.issues[0];
      const where = first?.path.length ? `${first.path.join(".")}: ` : "";
      return rejectGateway(
        request,
        gate.auth,
        gate.ip,
        first ? `${where}${first.message}` : "Invalid input",
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
      tools: parsedBody.tools,
      toolChoice: parsedBody.tool_choice,
      parallelToolCalls: parsedBody.parallel_tool_calls,
      stop: Array.isArray(parsedBody.stop) && !parsedBody.stop.length ? undefined : (parsedBody.stop ?? undefined),
      seed: parsedBody.seed,
      presencePenalty: parsedBody.presence_penalty,
      frequencyPenalty: parsedBody.frequency_penalty,
      responseFormat: parsedBody.response_format,
    },
    "openai",
  );
}
