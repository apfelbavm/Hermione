import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@i18n": path.resolve(import.meta.dirname, "src/shared/i18n.ts"),
    },
  },
});
