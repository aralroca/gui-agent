/**
 * `@aralroca/gui-agent/ui` — opt-in, dependency-free visualization of the
 * agent's interactions: a status chip per tool call ("Clicking" with a spinner
 * → ✓) plus an animated gradient glow ring around the DOM element being acted
 * on. Rendered in shadow DOM so styles never leak; themeable via `--gua-*`
 * custom properties.
 *
 * Wire it to an agent with {@link AgentVisualizer.bind}:
 *
 * ```ts
 * const viz = createAgentVisualizer({ container: document.querySelector("#steps") });
 * const agent = new GuiAgent(viz.bind({ llm }));
 * ```
 */
import { createChipList } from "./chips.js";
import { createHighlighter } from "./highlight.js";
import type { BackdropOptions } from "./highlight.js";
import type { LabelValue } from "./labels.js";
import type { AgentStep, GuiAgentOptions } from "../types.js";

export { DEFAULT_LABELS, humanizeToolName } from "./labels.js";
export type { LabelValue } from "./labels.js";
export type { BackdropOptions } from "./highlight.js";

export interface AgentVisualizerTheme {
  /** Spinner / accent color (`--gua-accent`). */
  accent?: string;
  /** Chip background (`--gua-chip-bg`). */
  chipBg?: string;
  /** Chip border color (`--gua-chip-border`). */
  chipBorder?: string;
  /** Chip text color (`--gua-chip-text`). */
  chipText?: string;
  /** Gradient stops for the glow ring (up to three are used). */
  glowColors?: string[];
  /** Font family for the chips (`--gua-font`). */
  font?: string;
}

export interface AgentVisualizerOptions {
  /** Show action status chips. Default true. */
  chips?: boolean;
  /** Glow the DOM element being acted on. Default true. */
  highlight?: boolean;
  /** Where to append the chip list host. If omitted, place `viz.element` yourself. */
  container?: Element;
  /** Per-tool chip labels; merged over the built-in defaults. */
  labels?: Record<string, LabelValue>;
  /** Show a "Thinking…" indicator while the LLM is deciding. Default true. */
  showThinking?: boolean;
  /** Show a locate button on chips whose target element is known. Default true. */
  locateButton?: boolean;
  /** Milliseconds the glow ring holds on the last target before fading. Default 1200. */
  glowDuration?: number;
  /** Minimum milliseconds per target when several highlights queue up. Default 500. */
  glowDwell?: number;
  /**
   * Blur/dim the rest of the page while the glow is visible, so the target
   * stands out. On by default. Pass `{ exclude: ["my-chat-panel"] }` with
   * element ids (or Elements) to keep sharp — the chip list already is.
   */
  backdrop?: boolean | BackdropOptions;
  theme?: AgentVisualizerTheme;
}

export interface AgentVisualizer {
  /** Feed agent steps (wire into `GuiAgentOptions.onStep`). */
  onStep(step: AgentStep): void;
  /** Manually flash the glow ring on any element (producer tools, custom UIs). */
  highlight(el: Element, opts?: { duration?: number }): void;
  /** Compose this visualizer's `onStep` into a {@link GuiAgentOptions} object. */
  bind<T extends GuiAgentOptions>(options: T): T;
  /** The chip-list host element (shadow DOM inside); append it anywhere. */
  readonly element: HTMLElement;
  /** Remove all chips (e.g. at the start of a new run). */
  clear(): void;
  /** Remove hosts, listeners, and timers. */
  dispose(): void;
}

export function createAgentVisualizer(options: AgentVisualizerOptions = {}): AgentVisualizer {
  const { chips = true, highlight = true, container, labels, showThinking, locateButton, glowDuration, glowDwell, backdrop = true, theme } = options;
  const userBackdrop = backdrop === true ? {} : backdrop; // BackdropOptions | false

  const chipList = createChipList({
    labels,
    showThinking,
    locateButton,
    onLocate: (el) => highlighter.highlight(el),
  });
  const highlighter = createHighlighter({
    glowDuration,
    glowDwell,
    glowColors: theme?.glowColors,
    // Keep the visualizer's own chip list sharp on top of any user excludes.
    backdrop: userBackdrop && {
      ...userBackdrop,
      exclude: [chipList.element, ...(userBackdrop.exclude ?? [])],
    },
  });
  applyTheme(chipList.element, theme);
  if (container) container.appendChild(chipList.element);

  const viz: AgentVisualizer = {
    element: chipList.element,
    onStep(step) {
      if (chips) chipList.onStep(step);
      if (highlight && step.type === "tool-target") highlighter.highlight(step.target.element);
    },
    highlight(el, opts) {
      highlighter.highlight(el, opts);
    },
    bind(agentOptions) {
      const { onStep } = agentOptions;
      return {
        ...agentOptions,
        onStep: (step: AgentStep) => {
          onStep?.(step);
          viz.onStep(step);
        },
      };
    },
    clear() {
      chipList.clear();
    },
    dispose() {
      chipList.dispose();
      highlighter.dispose();
    },
  };
  return viz;
}

function applyTheme(host: HTMLElement, theme: AgentVisualizerTheme | undefined): void {
  if (!theme) return;
  const vars: Record<string, string | undefined> = {
    "--gua-accent": theme.accent,
    "--gua-chip-bg": theme.chipBg,
    "--gua-chip-border": theme.chipBorder,
    "--gua-chip-text": theme.chipText,
    "--gua-font": theme.font,
  };
  for (const [name, value] of Object.entries(vars)) {
    if (value) host.style.setProperty(name, value);
  }
}
