/**
 * Action status chips — one chip per tool call, driven by {@link AgentStep}
 * events: spinner while running, ✓ on success, ✗ on error, blocked when
 * denied, plus a "Thinking…" indicator between LLM turns. `tool-target` steps
 * enrich the running chip with the target's accessible name and a locate
 * button.
 */
import { CHIPS_CSS } from "./styles.js";
import { createShadowHost } from "./host.js";
import { DEFAULT_LABELS, labelFor } from "./labels.js";
import type { LabelValue } from "./labels.js";
import type { AgentStep, ToolCall } from "../types.js";

const ICONS = {
  check:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 8.6 6.4 11.6 12.8 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  blocked:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M4.2 4.2l7.6 7.6" stroke="currentColor" stroke-width="1.5"/></svg>',
  locate:
    '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>',
  spinner: '<span class="spinner"></span>',
};

export interface ChipListOptions {
  labels?: Record<string, LabelValue>;
  showThinking?: boolean;
  locateButton?: boolean;
  /** Called when the user clicks a chip's locate button. */
  onLocate?: (el: Element) => void;
}

export interface ChipList {
  readonly element: HTMLElement;
  onStep(step: AgentStep): void;
  clear(): void;
  dispose(): void;
}

type ChipStatus = "running" | "done" | "error" | "denied";

export function createChipList(options: ChipListOptions = {}): ChipList {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const showThinking = options.showThinking !== false;
  const locateButton = options.locateButton !== false;

  const { host, root } = createShadowHost("data-gui-agent-steps", CHIPS_CSS);
  const list = document.createElement("div");
  list.className = "list";
  list.setAttribute("role", "status");
  root.appendChild(list);

  const chips = new Map<string, HTMLElement>();
  let thinking: HTMLElement | null = null;

  const removeThinking = () => {
    thinking?.remove();
    thinking = null;
  };

  const ensureThinking = () => {
    if (!showThinking || thinking) return;
    thinking = document.createElement("div");
    thinking.className = "thinking";
    thinking.innerHTML = 'Thinking<span class="dots"><span></span><span></span><span></span></span>';
    list.appendChild(thinking);
  };

  const setStatus = (chip: HTMLElement, status: ChipStatus) => {
    chip.dataset.status = status;
    chip.querySelector(".icon")!.innerHTML =
      status === "running" ? ICONS.spinner
      : status === "done" ? ICONS.check
      : status === "error" ? ICONS.cross
      : ICONS.blocked;
  };

  const addChip = (call: ToolCall): HTMLElement => {
    const chip = document.createElement("div");
    chip.className = "chip";
    const icon = document.createElement("span");
    icon.className = "icon";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = labelFor(call, labels);
    chip.append(icon, label);
    if (locateButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "locate";
      btn.hidden = true;
      btn.setAttribute("aria-label", "Locate element");
      btn.innerHTML = ICONS.locate;
      chip.appendChild(btn);
    }
    setStatus(chip, "running");
    // Keep the thinking indicator below the chips.
    list.insertBefore(chip, thinking);
    chips.set(call.id, chip);
    return chip;
  };

  return {
    element: host,
    onStep(step) {
      switch (step.type) {
        case "llm-request":
          ensureThinking();
          break;
        case "llm-response":
        case "done":
          removeThinking();
          break;
        case "tool-call":
          removeThinking();
          addChip(step.call);
          break;
        case "tool-result":
        case "tool-denied": {
          const chip = chips.get(step.call.id);
          if (chip) {
            setStatus(
              chip,
              step.type === "tool-denied" ? "denied" : step.result.isError ? "error" : "done",
            );
          }
          break;
        }
        case "tool-target": {
          const chip = chips.get(step.call.id);
          if (!chip) break;
          if (step.target.name) {
            chip.querySelector(".label")!.textContent = `${labelFor(step.call, labels)} “${step.target.name}”`;
          }
          const btn = chip.querySelector<HTMLButtonElement>(".locate");
          if (btn && options.onLocate) {
            const ref = new WeakRef(step.target.element);
            btn.hidden = false;
            btn.onclick = () => {
              const el = ref.deref();
              if (el?.isConnected) options.onLocate!(el);
            };
          }
          break;
        }
      }
    },
    clear() {
      chips.clear();
      thinking = null;
      list.replaceChildren();
    },
    dispose() {
      chips.clear();
      thinking = null;
      host.remove();
    },
  };
}
