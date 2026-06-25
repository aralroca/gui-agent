/**
 * Tool-result normalization.
 *
 * Tool `execute` functions may return a plain value, a string, or a full
 * MCP-style `{ content: [...] }` envelope. The agent loop and the WebMCP
 * registration layer both work with the normalized envelope.
 */
import type { ToolResultEnvelope } from "./types.js";

function isEnvelope(value: unknown): value is ToolResultEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/** Coerce any tool return value into a {@link ToolResultEnvelope}. */
export function normalizeResult(value: unknown): ToolResultEnvelope {
  if (isEnvelope(value)) return value;

  const text =
    typeof value === "string"
      ? value
      : value === undefined
        ? "ok"
        : safeStringify(value);

  return { content: [{ type: "text", text }] };
}

/** Build an error result envelope from a thrown value. */
export function errorResult(error: unknown): ToolResultEnvelope {
  const message = error instanceof Error ? error.message : safeStringify(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/** Flatten an envelope's content blocks to a single string for the model. */
export function envelopeToText(envelope: ToolResultEnvelope): string {
  return envelope.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
