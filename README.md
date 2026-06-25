# gui-agent

**An open-source, WebMCP-powered GUI agent that lives inside your web app.**

Let a natural-language agent operate your UI — click, fill, navigate, call your app's own actions — driven by any LLM you bring. Inspired by [page-agent](https://github.com/alibaba/page-agent), but built on the emerging [**WebMCP**](https://webmachinelearning.github.io/webmcp/) standard via a polyfill.

- 📦 **Just an npm package.** `npm i @aralroca/gui-agent` and `import`. **No script injection, no browser extension, no headless browser.**
- 🧩 **Standards-based.** Tools are registered on `document.modelContext` (WebMCP). The polyfill (`@mcp-b/webmcp-polyfill`) installs it where browsers don't natively support it yet.
- 🎯 **Producer + consumer in one.** Expose your app's actions as precise tools *and* fall back to text-based DOM driving for everything else.
- 🧠 **Bring your own LLM.** A tiny provider-agnostic interface, plus a ready-made Vercel AI SDK adapter.
- 🪶 **Headless.** No UI imposed — wire it to your own chat, command bar, or voice.

> ⚠️ Early/experimental. WebMCP is a moving [W3C draft](https://webmachinelearning.github.io/webmcp/); APIs may change.

## Install

```bash
npm i @aralroca/gui-agent
# optional peers, depending on what you use:
npm i ai zod        # for the AI SDK adapter / Zod schemas
```

## Quick start

```ts
import { defineTool, GuiAgent } from "@aralroca/gui-agent";
import { createAiSdkLlm } from "@aralroca/gui-agent/ai-sdk";

// 1. Expose your app's actions as tools (producer side, optional).
defineTool({
  name: "go_to_tab",
  description: "Switch the console to a tab.",
  inputSchema: { type: "object", properties: { tab: { type: "string" } }, required: ["tab"] },
  annotations: { readOnlyHint: true },
  execute: ({ tab }) => router.push(`/${tab}`),
});

// 2. Run the agent. It discovers your tools + synthesizes DOM tools (click/fill/read).
const agent = new GuiAgent({
  llm: createAiSdkLlm({ model: "anthropic/claude-opus-4-8" }),
  confirm: async (call) => window.confirm(`Allow "${call.name}"?`), // HITL gate
});

await agent.run("Invite jane@acme.com to the team as admin");
```

Importing the package installs the WebMCP polyfill automatically — **no `<script>` tag**.

## How it works

`gui-agent` unifies two approaches:

1. **Producer (WebMCP).** Your app calls `defineTool(...)` to register reliable, structured actions on `document.modelContext`. Any WebMCP agent — including a browser's native one — can use them.
2. **DOM fallback (page-agent style).** For anything not exposed, the agent builds a compact **text snapshot** of the page (roles, labels, values, stable refs like `e7`) and gets synthesized `read_page` / `click` / `fill` / `select_option` / `wait_for_text` tools. No screenshots, no multimodal model needed.

The built-in loop discovers all available tools, asks your LLM what to do, runs the calls (gated by your optional `confirm`), feeds results back, and repeats until done.

## API

### Core (`@aralroca/gui-agent`)

| Export | Purpose |
| --- | --- |
| `defineTool(def, opts?)` → `dispose` | Register a WebMCP tool. `def`: `{ name, description, inputSchema?, annotations?, execute }`. `inputSchema` accepts plain JSON Schema or a Zod schema. Unregister via the returned function or `opts.signal`. |
| `new GuiAgent(options)` / `agent.run(goal, signal?)` | The agent loop. Options: `{ llm, systemPrompt?, maxSteps?, domFallback?, confirm?, onStep? }`. |
| `runAgent(goal, options)` | One-shot convenience. |
| `registry` / `ToolRegistry` | The tool registry (source of truth, mirrored to `document.modelContext`). |
| `discoverExternalTools()` | Read tools registered on `document.modelContext` by other code. |
| `ensureModelContext()` / `hasModelContext()` | Polyfill bootstrap helpers. |
| `DomSnapshotter` / `createDomTools()` | The DOM-fallback primitives, if you want them standalone. |

### Bring your own LLM

Implement the `Llm` interface — one async function, one turn:

```ts
import type { Llm } from "@aralroca/gui-agent";

const llm: Llm = async ({ messages, tools, signal }) => {
  // call your model with `messages` + `tools`; return one turn
  return { text: "...", toolCalls: [{ id, name, arguments }] };
};
```

### AI SDK adapter (`@aralroca/gui-agent/ai-sdk`)

```ts
import { createAiSdkLlm, createRemoteLlm } from "@aralroca/gui-agent/ai-sdk";

// Run the model in-process (client key, demo, or server agent):
const llm = createAiSdkLlm({ model: "anthropic/claude-opus-4-8" });

// …or keep the model server-side and execute tools in the browser:
const llm = createRemoteLlm({ api: "/api/chat" });
// endpoint receives { messages, tools } and returns { text?, toolCalls? }
```

### React (`@aralroca/gui-agent/react`)

```tsx
import { useTool, GuiAgentProvider, useGuiAgent } from "@aralroca/gui-agent/react";

function UsersPage() {
  // Registered while mounted; auto-unregistered (AbortSignal) on unmount.
  useTool({
    name: "search_users",
    description: "Search users by name or id",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true },
    execute: ({ query }) => store.search(query),
  });
  return /* … */;
}

function Chat() {
  const { run, running, steps } = useGuiAgent();
  // wire to your own chat UI
}
```

## Safety

WebMCP tools run with the user's existing session/cookies, so a tool can do real, privileged things. `gui-agent` gives you a **`confirm` gate**: any tool *without* `annotations.readOnlyHint` is routed through your `confirm(call, tool)` callback before it runs — the natural place to plug in a human-in-the-loop approval UI. Mark genuinely read-only tools with `readOnlyHint: true` so they don't prompt. See the WebMCP spec's [security considerations](https://webmachinelearning.github.io/webmcp/#security-privacy).

## Demo

```bash
npm run demo   # opens a mini "console" you can drive in natural language
```

Try: *"invite jane@acme.com as admin"*, *"search Kenji"*, *"change my display name to Neo"* (the last one uses the DOM fallback — nothing is exposed for it).

## Develop

```bash
npm install
npm test          # vitest + jsdom
npm run build     # tsup → ESM + .d.ts for all entry points
npm run typecheck
```

## License

[MIT](./LICENSE) © Aral Roca
