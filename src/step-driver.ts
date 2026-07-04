/**
 * Step driver — feed {@link AgentStep} consumers (e.g. the `/ui` visualizer)
 * from an *external* agent loop.
 *
 * `GuiAgent` emits steps itself; when the loop lives elsewhere (a server-side
 * agent whose tool calls stream to the browser), this adapter produces the
 * same step stream from simple begin/end notifications. It tracks the active
 * tool call so DOM `onTarget` events get correlated to the right chip/glow
 * without the caller threading call ids around.
 */
import type { AgentStep, DomTargetEvent, ToolCall, ToolResultEnvelope } from "./types.js";

export interface StepDriver {
  /** The model is deciding (shows the "Thinking…" indicator). */
  thinking(): void;
  /** A tool call started executing in the browser. */
  toolStart(call: ToolCall): void;
  /** Wire into `DomToolsOptions.onTarget`; correlated to the active call. */
  onTarget(target: DomTargetEvent): void;
  /** A tool call finished (envelope `isError` drives the ✗ state). */
  toolResult(callId: string, result: ToolResultEnvelope): void;
  /** A tool call was denied by the user. */
  toolDenied(callId: string): void;
  /** The turn finished (clears the thinking indicator). */
  done(text?: string): void;
}

/** Create a {@link StepDriver} that forwards steps to `emit` (e.g. `viz.onStep`). */
export function createStepDriver(emit: (step: AgentStep) => void): StepDriver {
  const calls = new Map<string, ToolCall>();
  let active: ToolCall | null = null;

  const callFor = (callId: string): ToolCall =>
    calls.get(callId) ?? { id: callId, name: "unknown", arguments: {} };

  return {
    thinking() {
      emit({ type: "llm-request", messages: [], tools: [] });
    },
    toolStart(call) {
      calls.set(call.id, call);
      active = call;
      emit({ type: "tool-call", call });
    },
    onTarget(target) {
      if (active) emit({ type: "tool-target", call: active, target });
    },
    toolResult(callId, result) {
      const call = callFor(callId);
      if (active?.id === callId) active = null;
      emit({ type: "tool-result", call, result });
    },
    toolDenied(callId) {
      const call = callFor(callId);
      if (active?.id === callId) active = null;
      emit({ type: "tool-denied", call });
    },
    done(text = "") {
      active = null;
      emit({ type: "done", text });
    },
  };
}
