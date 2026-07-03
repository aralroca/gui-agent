import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuiAgent } from "../src/agent.js";
import { ToolRegistry } from "../src/registry.js";
import { scriptedLlm } from "./helpers.js";

describe("GuiAgent", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h1>Sign in</h1>
      <label for="email">Email</label>
      <input id="email" type="email" />
      <button id="save">Save</button>
    `;
  });

  it("drives the page via DOM fallback tools (fill then click)", async () => {
    const clicked = vi.fn();
    document.getElementById("save")!.addEventListener("click", clicked);

    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "fill", arguments: { ref: "e1", value: "a@b.com" } }] },
      { toolCalls: [{ id: "2", name: "click", arguments: { ref: "e2" } }] },
      { text: "Done." },
    ]);

    const agent = new GuiAgent({ llm, registry: new ToolRegistry() });
    const result = await agent.run("Sign in with a@b.com");

    expect((document.getElementById("email") as HTMLInputElement).value).toBe("a@b.com");
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("Done.");
    expect(result.stoppedEarly).toBe(false);
  });

  it("prefers and executes a host-registered producer tool", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(() => ({ ok: true }));
    registry.register({
      name: "sign_in",
      description: "Sign a user in",
      annotations: { readOnlyHint: false },
      execute,
    });

    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "sign_in", arguments: { email: "a@b.com" } }] },
      { text: "Signed in." },
    ]);

    const result = await new GuiAgent({ llm, registry, domFallback: false }).run("sign in");
    expect(execute).toHaveBeenCalledWith({ email: "a@b.com" });
    expect(result.text).toBe("Signed in.");
  });

  it("gates non-read-only tools through confirm and reports denial", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn();
    registry.register({ name: "delete_user", description: "Delete", execute });

    const denied: string[] = [];
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "delete_user", arguments: {} }] },
      { text: "Cancelled." },
    ]);

    const result = await new GuiAgent({
      llm,
      registry,
      domFallback: false,
      confirm: () => false,
      onStep: (s) => {
        if (s.type === "tool-denied") denied.push(s.call.name);
      },
    }).run("delete the user");

    expect(execute).not.toHaveBeenCalled();
    expect(denied).toEqual(["delete_user"]);
    expect(result.text).toBe("Cancelled.");
  });

  it("does not confirm read-only tools", async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(() => "[]");
    registry.register({ name: "list_users", description: "List", annotations: { readOnlyHint: true }, execute });
    const confirm = vi.fn(() => false);

    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "list_users", arguments: {} }] },
      { text: "Here you go." },
    ]);

    await new GuiAgent({ llm, registry, domFallback: false, confirm }).run("list users");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("stops early when the step budget is exhausted", async () => {
    const { llm } = scriptedLlm([
      { toolCalls: [{ id: "1", name: "read_page", arguments: {} }] },
      { toolCalls: [{ id: "2", name: "read_page", arguments: {} }] },
      { toolCalls: [{ id: "3", name: "read_page", arguments: {} }] },
    ]);
    const result = await new GuiAgent({ llm, registry: new ToolRegistry(), maxSteps: 2 }).run("loop");
    expect(result.stoppedEarly).toBe(true);
  });

  it("cleans up DOM fallback tools after a run", async () => {
    const registry = new ToolRegistry();
    const { llm } = scriptedLlm([{ text: "nothing to do" }]);
    await new GuiAgent({ llm, registry }).run("noop");
    expect(registry.has("read_page")).toBe(false);
    expect(registry.has("click")).toBe(false);
  });
});
