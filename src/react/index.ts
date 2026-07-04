/**
 * `@aralroca/gui-agent/react` — React bindings.
 *
 * - {@link useTool}: declaratively register a WebMCP tool for as long as a
 *   component is mounted. The tool is unregistered on unmount via `AbortSignal`,
 *   so a page's available tools always reflect what's actually on screen.
 * - {@link GuiAgentProvider} / {@link useGuiAgent}: run the agent from anywhere
 *   in the tree and observe its progress.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { GuiAgent } from "../agent.js";
import { registry } from "../registry.js";
import { createAgentVisualizer } from "../ui/index.js";
import type { AgentVisualizer, AgentVisualizerOptions } from "../ui/index.js";
import type { AgentStep, GuiAgentOptions, RunResult, ToolDefinition } from "../types.js";

/**
 * Register a tool while the component is mounted. Pass `deps` to re-register
 * when inputs change; the tool's `execute` always sees the latest closure.
 */
export function useTool<I extends Record<string, unknown>>(
  def: ToolDefinition<I>,
  deps: readonly unknown[] = [],
): void {
  const defRef = useRef(def);
  defRef.current = def;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const controller = new AbortController();
    registry.register(
      {
        name: def.name,
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
        // Always call the latest execute via the ref.
        execute: (input: I) => defRef.current.execute(input),
      },
      // `replace` keeps StrictMode/Fast Refresh double-mounts from throwing.
      { signal: controller.signal, replace: true },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.name, ...deps]);
}

interface GuiAgentContextValue {
  run: (goal: string) => Promise<RunResult>;
  running: boolean;
  steps: AgentStep[];
  lastResult: RunResult | null;
  /** The interaction visualizer, when enabled via the `visualizer` prop. */
  visualizer: AgentVisualizer | null;
}

const GuiAgentContext = createContext<GuiAgentContextValue | null>(null);

export interface GuiAgentProviderProps extends GuiAgentOptions {
  children?: ReactNode;
  /**
   * Visualize the agent's interactions (status chips + element glow) from
   * `@aralroca/gui-agent/ui`. Pass `true` for defaults, or options to
   * configure. Render the chips with {@link AgentSteps}.
   */
  visualizer?: boolean | AgentVisualizerOptions;
}

/** Provide a configured {@link GuiAgent} to the tree. */
export function GuiAgentProvider(props: GuiAgentProviderProps): ReactNode {
  const { children, onStep, visualizer: visualizerOption, ...options } = props;
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  // Client-only: the visualizer renders into the live document.
  const visualizer = useMemo(
    () =>
      visualizerOption && typeof document !== "undefined"
        ? createAgentVisualizer(visualizerOption === true ? {} : visualizerOption)
        : null,
    // Recreate only when toggled; option changes require a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Boolean(visualizerOption)],
  );
  useEffect(() => () => visualizer?.dispose(), [visualizer]);

  const agent = useMemo(
    () => {
      const agentOptions: GuiAgentOptions = {
        ...options,
        onStep: (step) => {
          setSteps((prev) => [...prev, step]);
          onStep?.(step);
        },
      };
      return new GuiAgent(visualizer ? visualizer.bind(agentOptions) : agentOptions);
    },
    // Rebuild only when the LLM identity changes; other options are read live
    // enough for typical usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.llm, visualizer],
  );

  const run = useCallback(
    async (goal: string) => {
      setRunning(true);
      setSteps([]);
      visualizer?.clear();
      try {
        const result = await agent.run(goal);
        setLastResult(result);
        return result;
      } finally {
        setRunning(false);
      }
    },
    [agent, visualizer],
  );

  const value = useMemo<GuiAgentContextValue>(
    () => ({ run, running, steps, lastResult, visualizer }),
    [run, running, steps, lastResult, visualizer],
  );

  return createElement(GuiAgentContext.Provider, { value }, children);
}

/** Access the agent provided by {@link GuiAgentProvider}. */
export function useGuiAgent(): GuiAgentContextValue {
  const ctx = useContext(GuiAgentContext);
  if (!ctx) throw new Error("useGuiAgent must be used within a <GuiAgentProvider>.");
  return ctx;
}

export interface AgentStepsProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * Render the visualizer's chip list. Requires `visualizer` to be enabled on
 * the surrounding {@link GuiAgentProvider}.
 */
export function AgentSteps(props: AgentStepsProps): ReactNode {
  const { visualizer } = useGuiAgent();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visualizer || !ref.current) return;
    ref.current.appendChild(visualizer.element);
    return () => visualizer.element.remove();
  }, [visualizer]);

  return createElement("div", { ref, className: props.className, style: props.style });
}
