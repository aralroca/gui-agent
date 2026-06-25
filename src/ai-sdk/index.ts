/**
 * `@aralroca/gui-agent/ai-sdk` — adapters that turn the Vercel AI SDK (v5/v6)
 * into a gui-agent {@link Llm}.
 *
 * Two flavors:
 * - {@link createAiSdkLlm}: run the model directly in the same runtime (handy
 *   for client-side keys, demos, or a server agent).
 * - {@link createRemoteLlm}: keep the model server-side (e.g. `/api/chat` route) and let 
 *   tools execute in the browser. The adapter just
 *   posts the transcript + tool specs and reads back one turn.
 *
 * Either way gui-agent owns the loop and executes every tool in the page, so
 * the AI SDK tools are declared *without* `execute`.
 */
import { generateText, jsonSchema, tool } from "ai";
import type { LanguageModel, ModelMessage, ToolSet } from "ai";
import type { AgentMessage, Llm, LlmResponse, ToolCall, ToolSpec } from "../types.js";

export interface AiSdkLlmOptions {
  /** The AI SDK model (or a gateway "provider/model" string). */
  model: LanguageModel;
  /** Extra settings forwarded to `generateText` (temperature, maxOutputTokens…). */
  settings?: Record<string, unknown>;
}

/** Build an {@link Llm} that calls an AI SDK model directly, one turn per call. */
export function createAiSdkLlm(options: AiSdkLlmOptions): Llm {
  return async ({ messages, tools, signal }) => {
    const result = await generateText({
      model: options.model,
      messages: toModelMessages(messages),
      tools: toToolSet(tools),
      abortSignal: signal,
      ...options.settings,
    });

    return {
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({
        id: c.toolCallId,
        name: c.toolName,
        arguments: (c.input ?? {}) as Record<string, unknown>,
      })),
    };
  };
}

export interface RemoteLlmOptions {
  /** Endpoint that runs the model server-side and returns one turn. */
  api: string;
  /** Extra headers (auth, etc). */
  headers?: Record<string, string>;
  /** Extra fields merged into the POST body. */
  body?: Record<string, unknown>;
  /** Custom fetch (defaults to global `fetch`). */
  fetch?: typeof fetch;
}

/**
 * Build an {@link Llm} backed by a server endpoint. The endpoint receives
 * `{ messages, tools, ...body }` and must respond with `{ text?, toolCalls? }`
 * (where each tool call is `{ id, name, arguments }`). This is the recommended
 * shape for embedding gui-agent in an app whose model/keys live on the server.
 */
export function createRemoteLlm(options: RemoteLlmOptions): Llm {
  const doFetch = options.fetch ?? fetch;
  return async ({ messages, tools, signal }) => {
    const res = await doFetch(options.api, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ messages, tools, ...options.body }),
      signal,
    });
    if (!res.ok) throw new Error(`gui-agent: LLM endpoint ${options.api} returned ${res.status}`);
    const data = (await res.json()) as LlmResponse;
    return { text: data.text, toolCalls: data.toolCalls ?? [] };
  };
}

/** Map gui-agent tool specs to an AI SDK `ToolSet` (declared without execute). */
export function toToolSet(specs: ToolSpec[]): ToolSet {
  const set: ToolSet = {};
  for (const spec of specs) {
    set[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputSchema),
    });
  }
  return set;
}

/** Map gui-agent's transcript to AI SDK `ModelMessage[]`. */
export function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const nameByCallId = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system") {
      out.push({ role: "system", content: msg.content });
    } else if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls?.length) {
        for (const call of msg.toolCalls) nameByCallId.set(call.id, call.name);
        out.push({
          role: "assistant",
          content: [
            ...(msg.content ? [{ type: "text" as const, text: msg.content }] : []),
            ...msg.toolCalls.map((call: ToolCall) => ({
              type: "tool-call" as const,
              toolCallId: call.id,
              toolName: call.name,
              input: call.arguments,
            })),
          ],
        });
      } else {
        out.push({ role: "assistant", content: msg.content });
      }
    } else if (msg.role === "tool") {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: msg.toolCallId ?? "",
            toolName: nameByCallId.get(msg.toolCallId ?? "") ?? "tool",
            output: { type: "text", value: msg.content },
          },
        ],
      });
    }
  }

  return out;
}
