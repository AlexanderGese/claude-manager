#!/usr/bin/env bun
import { mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paths } from "./platform/paths.ts";
import { patchSettings } from "./platform/settings.ts";
import { openDb } from "./registry/db.ts";
import { scan } from "./commands/scan.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = join(HERE, "hook", "hook.sh");

function main() {
  console.log("claude-manager: setting up...");

  mkdirSync(paths.root, { recursive: true });

  if (existsSync(HOOK_SRC)) {
    copyFileSync(HOOK_SRC, paths.hook);
    chmodSync(paths.hook, 0o755);
    console.log(`  hook installed: ${paths.hook}`);
  } else {
    console.warn(`  WARN: hook source not found at ${HOOK_SRC}`);
  }

  patchSettings(paths.settings, paths.hook);
  console.log(`  settings.json patched: ${paths.settings}`);

  const db = openDb();
  try {
    const n = scan(db, paths.claudeProjects);
    console.log(`  scanned existing sessions: ${n} new`);
  } finally { db.close(); }

  const shell = (process.env.SHELL ?? "").endsWith("/fish") ? "fish"
              : (process.env.SHELL ?? "").endsWith("/zsh")  ? "zsh"
              : "bash";
  const rc = shell === "fish" ? "~/.config/fish/config.fish"
           : shell === "zsh"  ? "~/.zshrc"
           : "~/.bashrc";
  console.log("");
  console.log(`Add this to your ${rc}:`);
  console.log("");
  console.log(`  eval "$(claude-manager init ${shell})"`);
  console.log("");
  console.log("Then open a new shell and run:  cm");
  console.log("");
}

try { main(); } catch (e) {
  console.warn("postinstall encountered an error (continuing):", e);
}
