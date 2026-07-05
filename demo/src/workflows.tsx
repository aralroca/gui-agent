/**
 * A React Flow (@xyflow/react) canvas for the demo's "Workflows" tab — a
 * generic node-based flow editor. It exists to prove the glow works on nodes a
 * tool creates asynchronously: React renders the new node on a later tick, so
 * highlighting it by *element* would no-op — the tool highlights it by
 * *selector* and the ring waits for it to mount (see highlight.ts WAIT_MS).
 */
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Snapshot = { nodes: Node[]; edges: Edge[] };

const START: Node = {
  id: "wf-start",
  position: { x: 120, y: 20 },
  data: { label: "Start" },
  type: "input",
};

// A tiny external store so the vanilla tool code (main.ts) can add nodes and
// React re-renders. addStep returns the new node id synchronously; the DOM node
// appears a tick later — exactly the case the selector-wait handles.
let snapshot: Snapshot = { nodes: [START], edges: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const workflowStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => snapshot,
  /** Add a step below the last node, wired to it. Returns the new node id. */
  addStep(label: string): string {
    const prev = snapshot.nodes[snapshot.nodes.length - 1]!;
    const index = snapshot.nodes.length;
    const id = `wf-${index}`;
    snapshot = {
      nodes: [
        ...snapshot.nodes,
        { id, position: { x: 120, y: 20 + index * 90 }, data: { label } },
      ],
      edges: [...snapshot.edges, { id: `e-${prev.id}-${id}`, source: prev.id, target: id }],
    };
    emit();
    return id;
  },
  reset() {
    snapshot = { nodes: [START], edges: [] };
    emit();
  },
};

function WorkflowsCanvas() {
  const snap = useSyncExternalStore(
    workflowStore.subscribe,
    workflowStore.getSnapshot,
    workflowStore.getSnapshot,
  );
  const { fitView } = useReactFlow();
  // Keep the new node in view as the flow grows.
  return (
    <ReactFlow
      nodes={snap.nodes}
      edges={snap.edges}
      fitView
      onNodesChange={() => fitView({ duration: 200 })}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/** Mount the canvas into a container (called once from main.ts). */
export function mountWorkflows(container: HTMLElement): void {
  createRoot(container).render(
    <div style={{ height: "100%" }}>
      <ReactFlowProvider>
        <WorkflowsCanvas />
      </ReactFlowProvider>
    </div>,
  );
}
