import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@i18n": path.resolve(__dirname, "src/shared/i18n.ts"),
    },
  },
});
