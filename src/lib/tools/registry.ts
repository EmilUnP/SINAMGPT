import type { LlmToolDefinition } from "@/lib/llm";
import type { JsonValue, ToolDefinition } from "./types";
import {
  assertSafeSchema,
  compileToolValidator,
  type ToolValidator,
} from "./validation";

const SAFE_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

type RegisteredTool = {
  definition: ToolDefinition;
  input: ToolValidator;
  result: ToolValidator;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  constructor(definitions: ToolDefinition[] = []) {
    definitions.forEach((definition) => this.register(definition));
  }

  register<
    TInput extends JsonValue = JsonValue,
    TResult extends JsonValue = JsonValue,
  >(definition: ToolDefinition<TInput, TResult>): void {
    if (!SAFE_TOOL_NAME.test(definition.name)) {
      throw new Error(`Unsafe tool name "${definition.name}"`);
    }
    if (this.tools.has(definition.name)) {
      throw new Error(`Duplicate tool name "${definition.name}"`);
    }
    const description = definition.description.trim();
    if (!description || description.length > 1_000) {
      throw new Error(`Tool "${definition.name}" has an invalid description`);
    }

    assertSafeSchema(
      definition.inputSchema,
      `${definition.name} input schema`,
      true,
    );
    assertSafeSchema(definition.resultSchema, `${definition.name} result schema`);

    this.tools.set(definition.name, {
      definition: definition as unknown as ToolDefinition,
      input: compileToolValidator(definition.inputSchema),
      result: compileToolValidator(definition.resultSchema),
    });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): readonly ToolDefinition[] {
    return Object.freeze(
      [...this.tools.values()].map((tool) => tool.definition),
    );
  }

  toLlmTools(): LlmToolDefinition[] {
    return [...this.tools.values()].map(({ definition }) => ({
      type: "function",
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.inputSchema as Record<string, unknown>,
      },
    }));
  }

  get size(): number {
    return this.tools.size;
  }
}
