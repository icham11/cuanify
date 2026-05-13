import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const roots = [".", ".."];
const forceClean = process.env.FORCE_DEV_CACHE_CLEAN === "1";

const activeDevRoots = roots.filter((root) =>
  existsSync(join(process.cwd(), root, ".next", "dev", "lock")),
);

if (activeDevRoots.length > 0 && !forceClean) {
  console.log(
    `[dev-cache] Skip cache cleanup because active Next dev lock exists in: ${activeDevRoots.join(", ")}`,
  );
  process.exit(0);
}

const targets = roots.flatMap((root) => [
  join(root, ".next"),
  join(root, ".turbo"),
]);

for (const target of targets) {
  rmSync(join(process.cwd(), target), { recursive: true, force: true });
}

console.log("[dev-cache] Cleared local and parent Next/Turbo caches");
