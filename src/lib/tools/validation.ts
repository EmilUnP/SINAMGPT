import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";
import type { JsonValue } from "./types";

export const MAX_TOOL_SCHEMA_BYTES = 16_384;
export const MAX_TOOL_PAYLOAD_BYTES = 32_768;
const MAX_DEPTH = 12;
const MAX_ARRAY_ITEMS = 256;
const MAX_OBJECT_KEYS = 128;
const MAX_STRING_CHARS = 16_384;

const ajv = new Ajv({
  allErrors: false,
  strict: true,
  ownProperties: true,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});

const byteLength = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

const assertStrictObjects = (schema: unknown, path = "$"): void => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const node = schema as Record<string, unknown>;
  const types = Array.isArray(node.type) ? node.type : [node.type];
  const isObject = types.includes("object") || node.properties !== undefined;

  if (isObject && node.additionalProperties !== false) {
    throw new Error(`${path} must set additionalProperties to false`);
  }
  if (node.patternProperties !== undefined) {
    throw new Error(`${path} must not use patternProperties`);
  }

  for (const key of ["properties", "$defs", "definitions"] as const) {
    const children = node[key];
    if (!children || typeof children !== "object" || Array.isArray(children)) {
      continue;
    }
    for (const [name, child] of Object.entries(children)) {
      assertStrictObjects(child, `${path}.${key}.${name}`);
    }
  }
  if (node.items) assertStrictObjects(node.items, `${path}.items`);
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
    const children = node[key];
    if (!Array.isArray(children)) continue;
    children.forEach((child, index) =>
      assertStrictObjects(child, `${path}.${key}[${index}]`),
    );
  }
  if (node.not) assertStrictObjects(node.not, `${path}.not`);
};

export const assertSafeSchema = (
  schema: AnySchema,
  label: string,
  requireObjectRoot = false,
): void => {
  if (byteLength(schema) > MAX_TOOL_SCHEMA_BYTES) {
    throw new Error(`${label} exceeds ${MAX_TOOL_SCHEMA_BYTES} bytes`);
  }
  if (typeof schema === "boolean") {
    throw new Error(`${label} must be an explicit JSON Schema object`);
  }
  if (requireObjectRoot && schema.type !== "object") {
    throw new Error(`${label} root type must be object`);
  }
  assertStrictObjects(schema);
  ajv.compile(schema);
};

function assertValueLimits(
  value: unknown,
  path = "$",
  depth = 0,
): asserts value is JsonValue {
  if (depth > MAX_DEPTH) throw new Error(`${path} exceeds maximum depth`);
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_CHARS) {
      throw new Error(`${path} string is too long`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`${path} has too many items`);
    }
    value.forEach((item, index) =>
      assertValueLimits(item, `${path}[${index}]`, depth + 1),
    );
    return;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must be a plain object`);
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) {
      throw new Error(`${path} has too many properties`);
    }
    entries.forEach(([key, child]) =>
      assertValueLimits(child, `${path}.${key}`, depth + 1),
    );
    return;
  }
  throw new Error(`${path} is not valid JSON`);
}

const formatError = (errors: ErrorObject[] | null | undefined): string => {
  const error = errors?.[0];
  if (!error) return "schema validation failed";
  return `${error.instancePath || "$"} ${error.message || "is invalid"}`;
};

export type ToolValidator = {
  validate: (value: unknown) => JsonValue;
};

export const compileToolValidator = (schema: AnySchema): ToolValidator => {
  const validate: ValidateFunction = ajv.compile(schema);
  return {
    validate(value: unknown): JsonValue {
      assertValueLimits(value);
      if (byteLength(value) > MAX_TOOL_PAYLOAD_BYTES) {
        throw new Error(`payload exceeds ${MAX_TOOL_PAYLOAD_BYTES} bytes`);
      }
      if (!validate(value)) throw new Error(formatError(validate.errors));
      return value;
    },
  };
};
