import { Database } from "bun:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { paths } from "../platform/paths.ts";

const SCHEMA_PATH = fileURLToPath(new URL("./schema.sql", import.meta.url));

const DEFAULT_SETTINGS: Record<string, string> = {
  prune_days: "0",
  hide_missing_dirs: "1",
  delete_jsonl_with_session: "ask",
  accent_color: "#D97757",
  schema_version: "1",
};

export function openDb(path: string = paths.db): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  seedDefaults(db);
  return db;
}

function seedDefaults(db: Database) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insert.run(k, v);
  }
}
