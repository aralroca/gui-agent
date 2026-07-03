import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuiAgent } from "../src/agent.js";
import { ToolRegistry } from "../src/registry.js";
import { DomSnapshotter } from "../src/dom/snapshot.js";
import { createDomTools } from "../src/dom/tools.js";
import { refOf, scriptedLlm } from "./helpers.js";
import type { AgentStep, DomTargetEvent } from "../src/types.js";

function toolMap(snapshotter: DomSnapshotter, onTarget: (e: DomTargetEvent) => void) {
  const tools = createDomTools(snapshotter, { onTarget });
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

describe("DomToolsOptions.onTarget", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" type="email" />
      <select id="role"><option>Viewer</option><option>Admin</option></select>
      <button id="save">Save changes</button>
    `;
  });

  it("fires with the resolved element before the action happens", async () => {
    const order: string[] = [];
    const events: DomTargetEvent[] = [];
    const snapshotter = new DomSnapshotter();
    const tools = toolMap(snapshotter, (e) => {
      order.push(`target:${e.action}`);
      events.push(e);
    });

    document.getElementById("save")!.addEventListener("click", () => order.push("clicked"));
    const emailRef = refOf(snapshotter, document.getElementById("email")!);
    const roleRef = refOf(snapshotter, document.getElementById("role")!);
    const saveRef = refOf(snapshotter, document.getElementById("save")!);

    await tools.fill!.execute({ ref: emailRef, value: "a@b.com" });
    await tools.select_option!.execute({ ref: roleRef, value: "Admin" });
    await tools.click!.execute({ ref: saveRef });

    expect(order).toEqual(["target:fill", "target:select_option", "target:click", "clicked"]);
    expect(events.map((e) => e.action)).toEqual(["fill", "select_option", "click"]);
    expect(events[0]!.element).toBe(document.getElementById("email"));
    expect(events[0]!.name).toBe("Email");
    expect(events[2]!.name).toBe("Save changes");
    expect(events[2]!.ref).toBe(saveRef);
  });

  it("does not break the tool when the observer throws", async () => {
    const snapshotter = new DomSnapshotter();
    const tools = toolMap(snapshotter, () => {
      throw new Error("observer boom");
    });
    const ref = refOf(snapshotter, document.getElementById("email")!);

    expect(await tools.fill!.execute({ ref, value: "x" })).toContain("Filled");
    expect((document.getElementById("email") as HTMLInputElement).value).toBe("x");
  });

  it("is re-emitted by the agent loop as a tool-target step with its call", async () => {
    const steps: AgentStep[] = [];
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "call-7", name: "fill", arguments: { ref: "e1", value: "a@b.com" } }] },
      { text: "Done." },
    ]);

    await new GuiAgent({ llm, registry: new ToolRegistry(), onStep: (s) => steps.push(s) }).run("fill email");

    const target = steps.find((s) => s.type === "tool-target");
    expect(target).toMatchObject({
      call: { id: "call-7", name: "fill" },
      target: { action: "fill", element: document.getElementById("email"), name: "Email" },
    });
    // Emitted between the call and its result.
    const types = steps.map((s) => s.type);
    expect(types.indexOf("tool-target")).toBeGreaterThan(types.indexOf("tool-call"));
    expect(types.indexOf("tool-target")).toBeLessThan(types.indexOf("tool-result"));
  });

  it("still chains a user-provided domTools.onTarget", async () => {
    const onTarget = vi.fn();
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "fill", arguments: { ref: "e1", value: "a@b.com" } }] },
      { text: "Done." },
    ]);

    await new GuiAgent({ llm, registry: new ToolRegistry(), domTools: { onTarget } }).run("fill email");

    expect(onTarget).toHaveBeenCalledTimes(1);
    expect(onTarget.mock.calls[0]![0]).toMatchObject({
      action: "fill",
      element: document.getElementById("email"),
      name: "Email",
    });
  });
});
