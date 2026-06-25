import { resolve } from "node:path";
import { defineConfig } from "vite";

// Demo playground config. Run with `npm run demo`.
// The package is aliased to source so the demo runs against live TS — no build step.
export default defineConfig({
  root: "demo",
  resolve: {
    alias: {
      "@aralroca/gui-agent/react": resolve(__dirname, "src/react/index.ts"),
      "@aralroca/gui-agent/ai-sdk": resolve(__dirname, "src/ai-sdk/index.ts"),
      "@aralroca/gui-agent": resolve(__dirname, "src/index.ts"),
    },
  },
});
