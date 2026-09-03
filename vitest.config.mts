import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/parks-data.ts", "src/lib/seed-reviews.ts", "src/lib/store.ts"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src") },
  },
});
