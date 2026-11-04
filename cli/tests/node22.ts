import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function findNode22(): string {
  const candidates: string[] = [
    "/opt/homebrew/opt/node@22/bin/node",
  ];

  // mise install: ~/.local/share/mise/installs/node/22.x.y/bin/node
  const home = process.env.HOME ?? "";
  const miseNodeDir = resolve(home, ".local/share/mise/installs/node");
  if (existsSync(miseNodeDir)) {
    try {
      const versions = readdirSync(miseNodeDir)
        .filter((v) => v.startsWith("22."))
        .sort()
        .reverse();
      for (const v of versions) {
        candidates.push(resolve(miseNodeDir, v, "bin/node"));
      }
    } catch { /* ignore */ }
  }

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  throw new Error(
    `Node 22 not found. Tried:\n${candidates.join("\n")}\n` +
    "Install it: brew install node@22  OR  mise install node@22"
  );
}

export const NODE22 = findNode22();
