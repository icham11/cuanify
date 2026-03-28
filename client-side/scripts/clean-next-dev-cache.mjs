import { rmSync } from "node:fs";
import { join } from "node:path";

const targets = [
  ".next",
  "../.next",
  ".turbo",
  "../.turbo",
];

for (const target of targets) {
  rmSync(join(process.cwd(), target), { recursive: true, force: true });
}

console.log("[dev-cache] Cleared local and parent Next/Turbo caches");
