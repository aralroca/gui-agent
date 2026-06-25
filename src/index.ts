/**
 * @aralroca/gui-agent — an open-source WebMCP-powered in-page GUI agent.
 *
 * Importing this entry installs the WebMCP polyfill on demand (no script
 * injection): register tools with {@link defineTool}, then drive the page with
 * {@link GuiAgent}. Bring your own LLM via the {@link Llm} interface, or use the
 * `@aralroca/gui-agent/ai-sdk` adapter.
 */
export { GuiAgent, runAgent } from "./agent.js";
export { defineTool, registry, ToolRegistry } from "./registry.js";
export type { Dispose, RegisterOptions } from "./registry.js";
export { discoverExternalTools } from "./discover.js";
export { ensureModelContext, hasModelContext, initializeWebMCPPolyfill } from "./polyfill.js";
export { DomSnapshotter } from "./dom/snapshot.js";
export { createDomTools } from "./dom/tools.js";
export type { DomToolsOptions } from "./dom/tools.js";
export { normalizeResult, errorResult, envelopeToText } from "./result.js";
export { toJsonSchema } from "./schema.js";

export type {
  AgentMessage,
  AgentStep,
  Confirm,
  GuiAgentOptions,
  InputSchema,
  JSONSchema,
  Llm,
  LlmRequest,
  LlmResponse,
  MessageRole,
  RegisteredTool,
  RunResult,
  ToolAnnotations,
  ToolCall,
  ToolContent,
  ToolDefinition,
  ToolResultEnvelope,
  ToolSpec,
} from "./types.js";
