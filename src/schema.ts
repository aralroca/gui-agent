/**
 * Input-schema normalization.
 *
 * gui-agent accepts either a plain JSON Schema (zero-dependency path) or a Zod
 * schema. Zod is an optional peer dependency, so it is imported lazily and only
 * when a Zod schema is actually passed.
 */
import type { InputSchema, JSONSchema } from "./types.js";

const EMPTY_OBJECT_SCHEMA: JSONSchema = { type: "object", properties: {} };

function looksLikeJsonSchema(value: object): boolean {
  return (
    "type" in value ||
    "properties" in value ||
    "$ref" in value ||
    "anyOf" in value ||
    "allOf" in value ||
    "oneOf" in value ||
    "enum" in value
  );
}

function looksLikeZodSchema(value: object): boolean {
  // Zod schemas expose a `parse` function and internal `_def`/`_zod` markers.
  return (
    "_def" in value ||
    "_zod" in value ||
    typeof (value as { parse?: unknown }).parse === "function" ||
    "~standard" in value
  );
}

/**
 * Synchronous best-effort conversion. Returns a JSON Schema for the
 * zero-dependency cases (missing schema or an already-plain JSON Schema), or
 * `null` when async conversion is required (a Zod schema). Used so `defineTool`
 * can register immediately and patch the schema once async conversion settles.
 */
export function toJsonSchemaSync(input: InputSchema | undefined): JSONSchema | null {
  if (input == null) return { ...EMPTY_OBJECT_SCHEMA };
  if (typeof input !== "object") return { ...EMPTY_OBJECT_SCHEMA };

  if (looksLikeJsonSchema(input) && !looksLikeZodSchema(input)) {
    return input as JSONSchema;
  }

  const selfConvert = (input as { toJSONSchema?: () => JSONSchema }).toJSONSchema;
  if (typeof selfConvert === "function") return selfConvert.call(input);

  return null;
}

/**
 * Convert a tool's declared input schema to a plain JSON Schema. Async because
 * Zod conversion may require dynamically importing the optional `zod` peer.
 */
export async function toJsonSchema(input: InputSchema | undefined): Promise<JSONSchema> {
  if (input == null) return { ...EMPTY_OBJECT_SCHEMA };

  if (typeof input !== "object") return { ...EMPTY_OBJECT_SCHEMA };

  // Already a JSON Schema — pass through untouched.
  if (looksLikeJsonSchema(input) && !looksLikeZodSchema(input)) {
    return input as JSONSchema;
  }

  // Future-proofing: anything that can convert itself.
  const selfConvert = (input as { toJSONSchema?: () => JSONSchema }).toJSONSchema;
  if (typeof selfConvert === "function") {
    return selfConvert.call(input);
  }

  if (looksLikeZodSchema(input)) {
    let z: typeof import("zod");
    try {
      z = await import("zod");
    } catch {
      throw new Error(
        "gui-agent: a Zod schema was passed as `inputSchema` but the optional `zod` peer dependency is not installed. Install `zod` or pass a plain JSON Schema instead.",
      );
    }
    // Zod v4 exposes a top-level converter.
    if (typeof (z as { toJSONSchema?: unknown }).toJSONSchema === "function") {
      return (z as unknown as { toJSONSchema: (s: unknown) => JSONSchema }).toJSONSchema(input);
    }
    throw new Error(
      "gui-agent: the installed `zod` version does not support `z.toJSONSchema()`. Upgrade to Zod v4 or pass a plain JSON Schema.",
    );
  }

  // Fallback: treat as an opaque object schema.
  return input as JSONSchema;
}
