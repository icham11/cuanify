import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const config = {
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    exclude: [
      "node_modules/**",
      ".git/**",
      "tests/e2e/**",
      "tests/visual/**",
      "tests/accessibility/**",
    ],
    globals: true,
    testTimeout: 30_000,
  },
};

export default config;
