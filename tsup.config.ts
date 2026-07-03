import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    polyfill: "src/polyfill.ts",
    "react/index": "src/react/index.ts",
    "ai-sdk/index": "src/ai-sdk/index.ts",
    "ui/index": "src/ui/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ["react", "ai", "zod"],
});
