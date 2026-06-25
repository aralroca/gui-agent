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
import type { AgentStep, Llm } from "@aralroca/gui-agent";

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
  inputSchema: { type: "object", properties: { tab: { type: "string", enum: ["users", "team", "profile"] } }, required: ["tab"] },
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
    (document.getElementById("invite-email") as HTMLInputElement).value = String(email);
    if (role) (document.getElementById("invite-role") as HTMLSelectElement).value = String(role);
    document.getElementById("invite-send")!.click();
    return `Invitation sent to ${email}${role ? ` as ${role}` : ""}.`;
  },
});

// ---- the offline demo planner (stand-in for a real LLM) ----------------------

const demoLlm: Llm = async ({ messages }) => {
  const goal = (messages.find((m) => m.role === "user")?.content ?? "").split("\n")[0]!;
  const step = messages.filter((m) => m.role === "assistant" && m.toolCalls?.length).length;
  const plan = planFor(goal);
  if (step < plan.length) return { toolCalls: [{ id: String(step), ...plan[step]! }] };
  return { text: plan.length ? "Done — completed your request." : "I couldn't map that to an action. Try 'invite x@y.com', 'search Jane', or 'change my display name to ...'." };
};

function planFor(goal: string): { name: string; arguments: Record<string, unknown> }[] {
  const g = goal.toLowerCase();

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
  return [];
}

// ---- wire the chat UI to the agent ------------------------------------------

const log = document.getElementById("log")!;
function add(kind: "user" | "agent" | "step", text: string) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

const onStep = (s: AgentStep) => {
  if (s.type === "tool-call") add("step", `→ ${s.call.name}(${JSON.stringify(s.call.arguments)})`);
  if (s.type === "tool-denied") add("step", `✋ denied: ${s.call.name}`);
};

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

const agent = new GuiAgent({
  llm,
  onStep,
  // Gate non-read-only tools — here we auto-approve, but this is the HITL seam.
  confirm: async (call) => {
    add("step", `✓ approved: ${call.name}`);
    return true;
  },
});

document.getElementById("ask")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("goal") as HTMLInputElement;
  const goal = input.value.trim();
  if (!goal) return;
  input.value = "";
  add("user", goal);
  const result = await agent.run(goal);
  add("agent", result.text);
});

add("agent", "Hi! Try: \"invite jane@acme.com as admin\", \"search Kenji\", or \"change my display name to Neo\".");
