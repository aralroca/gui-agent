/**
 * Core types for gui-agent.
 *
 * The package is built around the WebMCP tool model: a tool is a named function
 * with a natural-language description and a JSON Schema for its input. Tools are
 * registered on `document.modelContext` (via the polyfill) and consumed by the
 * built-in agent loop — or by any other WebMCP agent.
 */

import type { DomToolsOptions } from "./dom/tools.js";

/** A JSON Schema object describing a tool's input. */
export type JSONSchema = Record<string, unknown>;

/**
 * Accepted forms for a tool's input schema:
 * - a plain JSON Schema object (zero-dependency path), or
 * - a Zod schema (converted lazily via an optional `zod` peer dependency), or
 * - anything exposing a `toJSONSchema()` method (future-proofing).
 */
export type InputSchema = JSONSchema | StandardSchemaLike;

export interface StandardSchemaLike {
  // Zod v4 schemas, Standard Schema, etc. Detected structurally at registration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** MCP-style content block returned by a tool execution. */
export interface ToolContent {
  type: "text";
  text: string;
}

/** The normalized result envelope a tool execution resolves to. */
export interface ToolResultEnvelope {
  content: ToolContent[];
  /** Present when the tool reported a failure. */
  isError?: boolean;
}

/** Hints that influence how agents treat a tool (mirrors WebMCP `ToolAnnotations`). */
export interface ToolAnnotations {
  /** The tool does not mutate state; safe to call without user confirmation. */
  readOnlyHint?: boolean;
  /** The tool's output may contain untrusted content. */
  untrustedContentHint?: boolean;
}

/**
 * A tool definition. `execute` may return any JSON-serializable value, a string,
 * or a full {@link ToolResultEnvelope}; the result is normalized before it
 * reaches the model.
 */
export interface ToolDefinition<I = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: InputSchema;
  annotations?: ToolAnnotations;
  execute: (input: I) => unknown | Promise<unknown>;
}

/** A tool registered with the runtime, with its schema normalized to JSON Schema. */
export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: JSONSchema;
  annotations: ToolAnnotations;
  execute: (input: Record<string, unknown>) => Promise<ToolResultEnvelope>;
  /** Unregister the tool (from both the local registry and `document.modelContext`). */
  dispose: () => void;
}

/** The minimal spec the LLM needs to know a tool exists. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/** A request from the model to invoke a tool. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

/** A single message in the agent conversation. */
export interface AgentMessage {
  role: MessageRole;
  content: string;
  /** Present on assistant messages that request tool calls. */
  toolCalls?: ToolCall[];
  /** Present on tool messages; links a result back to its call. */
  toolCallId?: string;
}

/** What the LLM returns for one turn. */
export interface LlmResponse {
  /** Assistant free-text (may be empty when the model only emits tool calls). */
  text?: string;
  /** Tool calls the model wants to make this turn. */
  toolCalls?: ToolCall[];
}

/** Input handed to the {@link Llm} on every turn. */
export interface LlmRequest {
  messages: AgentMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
}

/**
 * Provider-agnostic LLM interface. Implement this with your own backend (a
 * server route, the Vercel AI SDK, the Anthropic SDK, …). The model stays
 * wherever you put it; tools always execute in the browser.
 */
export type Llm = (request: LlmRequest) => Promise<LlmResponse>;

/**
 * Confirmation gate for tool calls. Return `false` to reject a call (the model
 * is told it was denied). By default, tools without `readOnlyHint` are gated.
 */
export type Confirm = (call: ToolCall, tool: RegisteredTool | undefined) => boolean | Promise<boolean>;

/**
 * Fired by the DOM fallback tools with the resolved live element, just before
 * acting on it. The agent loop re-emits it as a `tool-target` step; UIs (e.g.
 * the `/ui` visualizer) use it to highlight the target.
 */
export interface DomTargetEvent {
  action: "click" | "fill" | "select_option";
  ref: string;
  element: HTMLElement;
  /** Accessible name of the element (may be empty). */
  name: string;
}

/** Events emitted as the agent loop runs, for UI/telemetry. */
export type AgentStep =
  | { type: "llm-request"; messages: AgentMessage[]; tools: ToolSpec[] }
  | { type: "llm-response"; response: LlmResponse }
  | { type: "tool-call"; call: ToolCall }
  | { type: "tool-target"; call: ToolCall; target: DomTargetEvent }
  | { type: "tool-denied"; call: ToolCall }
  | { type: "tool-result"; call: ToolCall; result: ToolResultEnvelope }
  | { type: "done"; text: string };

export interface GuiAgentOptions {
  /** The LLM that drives the loop. Required. */
  llm: Llm;
  /** Extra system prompt appended to the built-in instructions. */
  systemPrompt?: string;
  /** Maximum tool-calling rounds before the loop stops. Default 12. */
  maxSteps?: number;
  /** Synthesize click/fill/read tools from the live DOM. Default true. */
  domFallback?: boolean;
  /** Confirmation gate for non-read-only tool calls. */
  confirm?: Confirm;
  /** Observe each step of the loop. */
  onStep?: (step: AgentStep) => void;
  /** Options forwarded to the per-run DOM fallback tools (root, maxNodes, onTarget…). */
  domTools?: DomToolsOptions;
}

export interface RunResult {
  /** The agent's final assistant text. */
  text: string;
  /** The full message transcript. */
  messages: AgentMessage[];
  /** Whether the loop stopped because it hit `maxSteps`. */
  stoppedEarly: boolean;
}
