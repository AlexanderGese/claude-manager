import { existsSync, unlinkSync } from "node:fs";
import { paths } from "../platform/paths.ts";
import { unpatchSettings } from "../platform/settings.ts";

export function run(): void {
  unpatchSettings(paths.settings, paths.hook);
  if (existsSync(paths.hook)) unlinkSync(paths.hook);
  console.log("uninstalled hook + settings patch.");
  console.log(`registry preserved at: ${paths.root}`);
  console.log(`reminder: remove \`eval "$(claude-manager init ...)"\` from your shell rc.`);
}
