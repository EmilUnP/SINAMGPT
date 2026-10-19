import { z } from "zod";
import { MAX_CHAT_IMAGES } from "@/lib/attachments";

const functionName = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const toolCall = z.object({
  id: z.string().min(1).max(256),
  type: z.literal("function"),
  function: z.object({ name: functionName, arguments: z.string().max(1_000_000) }),
});

export const chatCompletionSchema = z.object({
  model: z.string().trim().min(1).max(256).optional(),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system", "developer", "tool"]),
    content: z.union([
      z.string().max(1_000_000),
      z.array(z.union([
        z.object({ type: z.literal("text"), text: z.string().max(1_000_000) }),
        z.object({ type: z.literal("image_url"), image_url: z.union([
          z.string().min(32).max(16_000_000),
          z.object({ url: z.string().min(32).max(16_000_000) }),
        ]) }),
      ])).min(1).max(24),
    ]).nullish(),
    images: z.array(z.object({
      mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      data: z.string().min(32).max(16_000_000),
      name: z.string().trim().max(200).optional(),
    })).max(MAX_CHAT_IMAGES).optional(),
    tool_calls: z.array(toolCall).min(1).max(128).optional(),
    tool_call_id: z.string().min(1).max(256).optional(),
    name: functionName.optional(),
    reasoning_content: z.string().max(1_000_000).nullish(),
  })).min(1).max(512),
  tools: z.array(z.object({
    type: z.literal("function"),
    function: z.object({
      name: functionName,
      description: z.string().max(100_000).optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
      strict: z.boolean().nullable().optional(),
    }),
  })).max(128).optional(),
  tool_choice: z.union([
    z.enum(["auto", "none", "required"]),
    z.object({ type: z.literal("function"), function: z.object({ name: functionName }) }),
  ]).optional(),
  parallel_tool_calls: z.boolean().optional(),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(8192).optional(),
  max_completion_tokens: z.number().int().min(1).max(8192).optional(),
  top_p: z.number().min(0.05).max(1).optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  stop: z.union([z.string().min(1).max(1024), z.array(z.string().min(1).max(1024)).min(1).max(4)]).nullish(),
  seed: z.number().int().optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  response_format: z.union([
    z.object({ type: z.enum(["text", "json_object"]) }),
    z.object({ type: z.literal("json_schema"), json_schema: z.object({
      name: functionName, description: z.string().optional(),
      schema: z.record(z.string(), z.unknown()), strict: z.boolean().nullable().optional(),
    }) }),
  ]).optional(),
  n: z.literal(1).optional(),
  // Reject legacy functions instead of silently turning an agent request into plain chat.
  functions: z.never().optional(),
  function_call: z.never().optional(),
}).superRefine((body, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
  const names = new Set((body.tools ?? []).map((tool) => tool.function.name));
  if (names.size !== (body.tools?.length ?? 0)) issue("Tool names must be unique", ["tools"]);
  if (body.tool_choice && body.tool_choice !== "none" && !names.size) {
    issue("tool_choice requires tools", ["tool_choice"]);
  }
  if (typeof body.tool_choice === "object" && !names.has(body.tool_choice.function.name)) {
    issue("tool_choice must name one of the supplied tools", ["tool_choice"]);
  }
  const pending = new Set<string>();
  const seen = new Set<string>();
  body.messages.forEach((message, index) => {
    const path = ["messages", index];
    if (message.role === "tool") {
      if (!message.tool_call_id || !pending.delete(message.tool_call_id)) {
        issue("Tool result must reference an unanswered assistant tool_call_id", path);
      }
      if (message.content == null) issue("Tool result content is required", path);
    } else {
      if (pending.size) issue("All assistant tool calls must have results before the next message", path);
      if (message.tool_call_id) issue("tool_call_id is only valid for tool messages", path);
    }
    if (message.tool_calls?.length) {
      if (message.role !== "assistant") issue("tool_calls are only valid for assistant messages", path);
      for (const call of message.tool_calls) {
        if (seen.has(call.id)) issue("Tool call IDs must be unique", path);
        seen.add(call.id);
        pending.add(call.id);
      }
    }
  });
  if (pending.size) issue("Supply tool results before requesting the next completion", ["messages"]);
});
