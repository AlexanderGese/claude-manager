import { existsSync, readFileSync, statSync } from "node:fs";
import { paths } from "../platform/paths.ts";

interface Check { name: string; ok: boolean; detail: string }

function checks(): Check[] {
  const out: Check[] = [];

  out.push({
    name: "registry directory",
    ok: existsSync(paths.root),
    detail: paths.root,
  });

  out.push({
    name: "hook.sh installed",
    ok: existsSync(paths.hook) && (statSync(paths.hook).mode & 0o111) !== 0,
    detail: paths.hook,
  });

  out.push({
    name: "registry db",
    ok: existsSync(paths.db),
    detail: paths.db,
  });

  let patched = false;
  if (existsSync(paths.settings)) {
    try {
      const j = JSON.parse(readFileSync(paths.settings, "utf8"));
      const hooks = j?.hooks ?? {};
      const allEntries = [
        ...(hooks.SessionStart ?? []),
        ...(hooks.Stop ?? []),
      ];
      patched = allEntries.some((e: any) =>
        (e.hooks ?? []).some((h: any) =>
          typeof h.command === "string" && h.command.includes(".claudemanager/hook.sh")
        )
      );
    } catch { /* leave false */ }
  }
  out.push({ name: "settings.json patched", ok: patched, detail: paths.settings });

  let claude = false;
  try {
    const p = (process.env.PATH ?? "").split(":");
    claude = p.some(d => d && existsSync(`${d}/claude`));
  } catch { /* ignore */ }
  out.push({ name: "claude on PATH", ok: claude, detail: "which claude" });

  return out;
}

export function run(): void {
  const results = checks();
  let failed = 0;
  for (const c of results) {
    const tag = c.ok ? "OK  " : "FAIL";
    process.stdout.write(`[${tag}] ${c.name.padEnd(28)} ${c.detail}\n`);
    if (!c.ok) failed++;
  }
  process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
  if (failed > 0) {
    process.stdout.write("\nFix suggestions:\n");
    process.stdout.write("  - run `claude-manager` postinstall again, or `npm i -g claude-manager`\n");
    process.stdout.write("  - add `eval \"$(claude-manager init zsh)\"` to your ~/.zshrc\n");
    process.exit(1);
  }
}
