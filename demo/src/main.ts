/**
 * gui-agent demo — a mini "console" driven by natural language.
 *
 * It shows both halves of the gui-agent model:
 *  1. Producer tools: the app registers precise WebMCP tools (go_to_tab,
 *     search_users, invite_member) with `defineTool`.
 *  2. DOM fallback: anything not exposed (e.g. editing the display name) is
 *     still reachable because the agent can read the page and fill/click.
 *
 * The "LLM" here is a tiny offline planner so the demo runs with zero config.
 * In a real app you'd swap it for `createAiSdkLlm({ model })` or
 * `createRemoteLlm({ api: '/api/chat' })` from `@aralroca/gui-agent/ai-sdk`.
 */
import { defineTool, GuiAgent } from "@aralroca/gui-agent";
import type { Llm } from "@aralroca/gui-agent";
import { createAgentVisualizer } from "@aralroca/gui-agent/ui";
import { mountWorkflows, workflowStore } from "./workflows";

// ---- mini console behavior ---------------------------------------------------

const USERS = [
  { name: "Aral Roca", country: "Spain", status: "Active" },
  { name: "Jane Doe", country: "USA", status: "Pending" },
  { name: "Kenji Tanaka", country: "Japan", status: "Active" },
];

function renderUsers(filter = "") {
  const rows = document.getElementById("user-rows")!;
  rows.innerHTML = USERS.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()))
    .map((u) => `<tr><td>${u.name}</td><td>${u.country}</td><td>${u.status}</td></tr>`)
    .join("");
}

function selectTab(tab: string) {
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#tabs button")) {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
  }
  for (const panel of document.querySelectorAll<HTMLElement>(".panel")) {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  }
}

// Mount the React Flow canvas for the Workflows tab.
mountWorkflows(document.getElementById("wf-canvas")!);

document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((btn) =>
  btn.addEventListener("click", () => selectTab(btn.dataset.tab!)),
);
document.getElementById("user-search")!.addEventListener("input", (e) =>
  renderUsers((e.target as HTMLInputElement).value),
);
document.getElementById("invite-send")!.addEventListener("click", () => {
  const email = (document.getElementById("invite-email") as HTMLInputElement).value;
  const role = (document.getElementById("invite-role") as HTMLSelectElement).value;
  const toast = document.getElementById("invite-toast")!;
  toast.textContent = email ? `Invited ${email} as ${role}.` : "Enter an email first.";
  toast.style.display = "block";
});
renderUsers();

// ---- producer tools (WebMCP) -------------------------------------------------

defineTool({
  name: "go_to_tab",
  description: "Switch the console to a tab.",
  inputSchema: { type: "object", properties: { tab: { type: "string", enum: ["users", "team", "profile", "workflows"] } }, required: ["tab"] },
  annotations: { readOnlyHint: true },
  execute: ({ tab }) => {
    selectTab(String(tab));
    return `Now on the ${tab} tab.`;
  },
});

defineTool({
  name: "search_users",
  description: "Filter the users table by a name query.",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  annotations: { readOnlyHint: true },
  execute: ({ query }) => {
    selectTab("users");
    const search = document.getElementById("user-search") as HTMLInputElement;
    search.value = String(query);
    viz.highlight(search);
    renderUsers(String(query));
    const matches = USERS.filter((u) => u.name.toLowerCase().includes(String(query).toLowerCase()));
    return `Found ${matches.length} user(s): ${matches.map((m) => m.name).join(", ") || "none"}.`;
  },
});

defineTool({
  name: "invite_member",
  description: "Invite a teammate by email with a role (Viewer, Editor, Admin).",
  inputSchema: {
    type: "object",
    properties: { email: { type: "string" }, role: { type: "string", enum: ["Viewer", "Editor", "Admin"] } },
    required: ["email"],
  },
  execute: ({ email, role }) => {
    selectTab("team");
    // Producer tools opt into the glow by highlighting what they touch; the
    // visualizer queues these so the ring tours email → role → send button.
    const emailInput = document.getElementById("invite-email") as HTMLInputElement;
    emailInput.value = String(email);
    viz.highlight(emailInput);
    if (role) {
      const roleSelect = document.getElementById("invite-role") as HTMLSelectElement;
      roleSelect.value = String(role);
      viz.highlight(roleSelect);
    }
    const send = document.getElementById("invite-send")!;
    viz.highlight(send);
    send.click();
    return `Invitation sent to ${email}${role ? ` as ${role}` : ""}.`;
  },
});

defineTool({
  name: "add_workflow_step",
  description: "Add a step to the workflow on the Workflows tab (React Flow canvas).",
  inputSchema: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
  execute: ({ label }) => {
    selectTab("workflows");
    // The node id is returned synchronously, but React Flow mounts its DOM node
    // a tick later — so we highlight it by SELECTOR and the ring waits for it
    // (Element highlighting here would no-op). This is the xyflow glow path.
    const id = workflowStore.addStep(String(label));
    viz.highlight(`.react-flow__node[data-id="${id}"]`);
    return `Added step "${label}" to the workflow.`;
  },
});

// ---- the offline demo planner (stand-in for a real LLM) ----------------------

const demoLlm: Llm = async ({ messages }) => {
  // A real model takes a moment to think; simulate it so the visualizer's
  // "Thinking…" and spinner states are visible.
  await new Promise((resolve) => setTimeout(resolve, 350));
  const goal = (messages.find((m) => m.role === "user")?.content ?? "").split("\n")[0]!;
  const step = messages.filter((m) => m.role === "assistant" && m.toolCalls?.length).length;
  const plan = planFor(goal);
  if (step < plan.length) return { toolCalls: [{ id: String(step), ...plan[step]! }] };
  return { text: plan.length ? "Done — completed your request." : "I couldn't map that to an action. Try 'invite x@y.com', 'search Jane', or 'change my display name to ...'." };
};

function planFor(goal: string): { name: string; arguments: Record<string, unknown> }[] {
  const g = goal.toLowerCase();

  // Flow builder (React Flow tab): "build a workflow" adds a chain of steps;
  // "add step X" adds one. Each step is highlighted as it mounts.
  const addStep = goal.match(/add\s+(?:a\s+)?(?:step\s+)?["“]?([\w \-]+?)["”]?\s*(?:step)?$/i);
  if (
    (g.includes("workflow") || g.includes("flow") || g.includes("pipeline")) &&
    (g.includes("build") || g.includes("create"))
  ) {
    return ["Trigger", "Fetch data", "Transform", "Send notification"].map((label) => ({
      name: "add_workflow_step",
      arguments: { label },
    }));
  }
  if (g.includes("step") && addStep) {
    return [{ name: "add_workflow_step", arguments: { label: addStep[1]!.trim() } }];
  }

  const invite = goal.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  if (g.includes("invite") && invite) {
    const role = /admin/.test(g) ? "Admin" : /editor/.test(g) ? "Editor" : "Viewer";
    return [{ name: "invite_member", arguments: { email: invite[1], role } }];
  }

  const search = goal.match(/(?:search|find|filter)\s+(?:for\s+|users?\s+)?([\w]+)/i);
  if (search) return [{ name: "search_users", arguments: { query: search[1] } }];

  // DOM-fallback path: nothing exposed for editing the display name, so the
  // agent reads the page and fills the field itself.
  const rename = goal.match(/(?:display name|name)\s+to\s+(.+)$/i);
  if (g.includes("name") && rename) {
    return [
      { name: "go_to_tab", arguments: { tab: "profile" } },
      { name: "read_page", arguments: {} },
      { name: "fill", arguments: { ref: "e?", value: rename[1]!.trim() } }, // ref patched below
    ];
  }

  if (g.includes("profile")) return [{ name: "go_to_tab", arguments: { tab: "profile" } }];
  if (g.includes("team")) return [{ name: "go_to_tab", arguments: { tab: "team" } }];
  if (g.includes("workflow")) return [{ name: "go_to_tab", arguments: { tab: "workflows" } }];
  return [];
}

// ---- wire the chat UI to the agent ------------------------------------------

const log = document.getElementById("log")!;
function add(kind: "user" | "agent", text: string) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// The interaction visualizer: status chips above the input + a gradient glow
// around whichever element the agent acts on, while the rest of the page (bar
// the chat panel) blurs behind it. Enabled by default.
const viz = createAgentVisualizer({
  container: document.getElementById("agent-steps")!,
  backdrop: { exclude: ["assistant-panel"] },
});

// `demoLlm` emits a placeholder ref for the DOM-fallback rename; resolve it from
// the live snapshot just before the call so the demo "just works".
const llm: Llm = async (req) => {
  const res = await demoLlm(req);
  for (const call of res.toolCalls ?? []) {
    if (call.name === "fill" && call.arguments.ref === "e?") {
      const input = document.getElementById("display-name");
      const snapshotLine = req.messages.flatMap((m) => m.content.split("\n")).find((l) => l.includes("Display name"));
      const ref = snapshotLine?.match(/\[(e\d+)\]/)?.[1];
      if (ref) call.arguments.ref = ref;
      else if (input) (input as HTMLInputElement).value = String(call.arguments.value); // last-ditch
    }
  }
  return res;
};

const agent = new GuiAgent(
  viz.bind({
    llm,
    // Gate non-read-only tools — here we auto-approve, but this is the HITL seam.
    confirm: async () => true,
  }),
);

document.getElementById("ask")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("goal") as HTMLInputElement;
  const goal = input.value.trim();
  if (!goal) return;
  input.value = "";
  add("user", goal);
  viz.clear();
  const result = await agent.run(goal);
  add("agent", result.text);
});

add(
  "agent",
  'Hi! Try: "invite jane@acme.com as admin", "search Kenji", "change my display name to Neo", or "build a workflow" (watch the glow follow each React Flow node).',
);
