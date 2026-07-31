import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts", "server/__tests__/**/*.test.ts", "client/src/**/*.test.tsx"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.test.ts", "server/__tests__/**", "node_modules"],
    },
  },
  // Client component tests are .tsx and declare `@vitest-environment jsdom`
  // per-file; the global environment stays "node" for the server suite.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
});
