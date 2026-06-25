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
import type { ReactNode } from "react";
import { GuiAgent } from "../agent.js";
import { registry } from "../registry.js";
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
      { signal: controller.signal },
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
}

const GuiAgentContext = createContext<GuiAgentContextValue | null>(null);

export interface GuiAgentProviderProps extends GuiAgentOptions {
  children?: ReactNode;
}

/** Provide a configured {@link GuiAgent} to the tree. */
export function GuiAgentProvider(props: GuiAgentProviderProps): ReactNode {
  const { children, onStep, ...options } = props;
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const agent = useMemo(
    () =>
      new GuiAgent({
        ...options,
        onStep: (step) => {
          setSteps((prev) => [...prev, step]);
          onStep?.(step);
        },
      }),
    // Rebuild only when the LLM identity changes; other options are read live
    // enough for typical usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.llm],
  );

  const run = useCallback(
    async (goal: string) => {
      setRunning(true);
      setSteps([]);
      try {
        const result = await agent.run(goal);
        setLastResult(result);
        return result;
      } finally {
        setRunning(false);
      }
    },
    [agent],
  );

  const value = useMemo<GuiAgentContextValue>(
    () => ({ run, running, steps, lastResult }),
    [run, running, steps, lastResult],
  );

  return createElement(GuiAgentContext.Provider, { value }, children);
}

/** Access the agent provided by {@link GuiAgentProvider}. */
export function useGuiAgent(): GuiAgentContextValue {
  const ctx = useContext(GuiAgentContext);
  if (!ctx) throw new Error("useGuiAgent must be used within a <GuiAgentProvider>.");
  return ctx;
}
