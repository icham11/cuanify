import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const forceClean = process.env.FORCE_DEV_CACHE_CLEAN === "1";
const devLockPath = join(process.cwd(), ".next", "dev", "lock");

if (existsSync(devLockPath) && !forceClean) {
  console.log("[dev-cache] Skip cache cleanup because local Next dev lock exists");
  process.exit(0);
}

const targets = [
  join(process.cwd(), ".next", "cache"),
  join(process.cwd(), ".next", "dev", "cache"),
  join(process.cwd(), ".turbo"),
];

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
}

console.log("[dev-cache] Cleared local Next/Turbo caches");
