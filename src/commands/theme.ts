import { THEMES } from "../tui/theme.ts";
import { openDb } from "../registry/db.ts";

const THEME_NAMES = Object.keys(THEMES);

function getActive(): string {
  try {
    const db = openDb();
    try {
      return db.query<{ value: string }, []>(
        "SELECT value FROM settings WHERE key='theme'"
      ).get()?.value ?? "coral";
    } finally { db.close(); }
  } catch { return "coral"; }
}

function setActive(name: string): void {
  const db = openDb();
  try {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", [name]);
  } finally { db.close(); }
}

export function run(args: string[]): void {
  const sub = args[0] ?? "list";

  if (sub === "list") {
    const active = getActive();
    for (const name of THEME_NAMES) {
      const marker = name === active ? " (active)" : "";
      console.log(`  ${name}${marker}`);
    }
    return;
  }

  if (sub === "reset") {
    setActive("coral");
    console.log("theme reset to coral");
    return;
  }

  // Set theme by name.
  const name = sub.toLowerCase();
  if (!THEMES[name]) {
    console.error(`unknown theme '${name}'. Available: ${THEME_NAMES.join(", ")}`);
    process.exit(1);
  }
  setActive(name);
  console.log(`theme set to ${name}`);
}
