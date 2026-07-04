/**
 * The GuiAgent loop.
 *
 * A small, provider-agnostic ReAct-style loop: discover the tools available on
 * the page (host-registered WebMCP tools + synthesized DOM tools), ask the LLM
 * what to do, run the requested tool calls (gated by an optional confirmation
 * step), feed results back, and repeat until the model is done or `maxSteps`
 * is reached.
 */
import { createDomTools } from "./dom/tools.js";
import { DomSnapshotter } from "./dom/snapshot.js";
import { registry as defaultRegistry, ToolRegistry } from "./registry.js";
import { envelopeToText } from "./result.js";
import type {
  AgentMessage,
  DomTargetEvent,
  GuiAgentOptions,
  RunResult,
  ToolCall,
  ToolSpec,
} from "./types.js";

const DEFAULT_SYSTEM_PROMPT = `You are a GUI agent embedded in a web application. You accomplish the user's goal by calling tools that operate the live page on their behalf.

Guidelines:
- Prefer the application's own purpose-built tools over generic DOM tools when both could work.
- If a "read_page" tool is available, call it to see the current interactive elements (each has a ref like e7) before clicking or filling, and again after the page changes.
- Take one concrete step at a time. After each action, check the result before continuing.
- Be careful with actions that create, modify, delete, or send data — only do them when clearly required by the goal.
- When the goal is achieved (or cannot be), stop calling tools and reply with a short summary of what you did.`;

export class GuiAgent {
  private readonly options: GuiAgentOptions;
  private readonly registry: ToolRegistry;

  constructor(options: GuiAgentOptions & { registry?: ToolRegistry }) {
    if (!options.llm) throw new Error("gui-agent: `llm` is required.");
    this.options = options;
    this.registry = options.registry ?? defaultRegistry;
  }

  /**
   * Run the agent toward `goal`. Resolves when the model stops calling tools or
   * the step budget is exhausted.
   */
  async run(goal: string, runSignal?: AbortSignal): Promise<RunResult> {
    const { llm, maxSteps = 12, domFallback = true, confirm, onStep } = this.options;

    // Per-run DOM tools, auto-disposed when the run ends.
    const domAbort = new AbortController();
    const snapshotter = new DomSnapshotter();
    // Tracks the tool call being executed so DOM target events can be
    // re-emitted on the step stream with their originating call attached.
    const active: { call: ToolCall | null } = { call: null };
    if (domFallback) {
      const domTools = {
        ...this.options.domTools,
        onTarget: (event: DomTargetEvent) => {
          this.options.domTools?.onTarget?.(event);
          if (active.call) onStep?.({ type: "tool-target", call: active.call, target: event });
        },
      };
      for (const tool of createDomTools(snapshotter, domTools)) {
        if (!this.registry.has(tool.name)) {
          this.registry.register(tool, { signal: domAbort.signal, skipModelContext: true });
        }
      }
    }

    const messages: AgentMessage[] = [
      { role: "system", content: this.systemPrompt() },
      { role: "user", content: this.initialUserMessage(goal, domFallback, snapshotter) },
    ];

    let stoppedEarly = true;
    let finalText = "";

    try {
      for (let step = 0; step < maxSteps; step++) {
        const tools = this.toolSpecs();
        onStep?.({ type: "llm-request", messages, tools });

        const response = await llm({ messages, tools, signal: runSignal });
        onStep?.({ type: "llm-response", response });

        const toolCalls = response.toolCalls ?? [];
        if (toolCalls.length === 0) {
          finalText = response.text ?? "";
          messages.push({ role: "assistant", content: finalText });
          stoppedEarly = false;
          onStep?.({ type: "done", text: finalText });
          break;
        }

        messages.push({ role: "assistant", content: response.text ?? "", toolCalls });

        for (const call of toolCalls) {
          const text = await this.runToolCall(call, confirm, onStep, active);
          messages.push({ role: "tool", content: text, toolCallId: call.id });
        }
      }
    } finally {
      domAbort.abort();
    }

    return { text: finalText, messages, stoppedEarly };
  }

  private async runToolCall(
    call: ToolCall,
    confirm: GuiAgentOptions["confirm"],
    onStep: GuiAgentOptions["onStep"],
    active: { call: ToolCall | null },
  ): Promise<string> {
    const tool = this.registry.get(call.name);
    onStep?.({ type: "tool-call", call });

    if (!tool) {
      return `Error: unknown tool "${call.name}".`;
    }

    // Gate non-read-only tools through the confirmation hook when provided.
    if (confirm && !tool.annotations.readOnlyHint) {
      const approved = await confirm(call, tool);
      if (!approved) {
        onStep?.({ type: "tool-denied", call });
        return "The user denied this action.";
      }
    }

    active.call = call;
    try {
      const result = await tool.execute(call.arguments ?? {});
      onStep?.({ type: "tool-result", call, result });
      return envelopeToText(result) || (result.isError ? "Error" : "ok");
    } finally {
      active.call = null;
    }
  }

  private toolSpecs(): ToolSpec[] {
    return this.registry.listToolSpecs();
  }

  private systemPrompt(): string {
    const extra = this.options.systemPrompt ? `\n\n${this.options.systemPrompt}` : "";
    return DEFAULT_SYSTEM_PROMPT + extra;
  }

  private initialUserMessage(goal: string, domFallback: boolean, snapshotter: DomSnapshotter): string {
    if (!domFallback) return goal;
    const snapshot = snapshotter.snapshot();
    if (!snapshot || snapshot.startsWith("(")) return goal;
    return `${goal}\n\nCurrent page:\n${snapshot}`;
  }
}

/** Convenience: construct a {@link GuiAgent} and immediately run a goal. */
export function runAgent(
  goal: string,
  options: GuiAgentOptions & { registry?: ToolRegistry },
): Promise<RunResult> {
  return new GuiAgent(options).run(goal);
}
