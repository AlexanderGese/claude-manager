CREATE TABLE IF NOT EXISTS sessions (
  session_id        TEXT PRIMARY KEY,
  cwd               TEXT NOT NULL,
  launch_argv_json  TEXT NOT NULL,
  env_json          TEXT,
  git_branch        TEXT,
  git_sha           TEXT,
  first_prompt      TEXT,
  custom_name       TEXT,
  is_favorite       INTEGER NOT NULL DEFAULT 0,
  is_archived       INTEGER NOT NULL DEFAULT 0,
  is_backfilled     INTEGER NOT NULL DEFAULT 0,
  message_count     INTEGER NOT NULL DEFAULT 0,
  token_count       INTEGER NOT NULL DEFAULT 0,
  status            TEXT,
  created_at        INTEGER NOT NULL,
  last_activity_at  INTEGER NOT NULL,
  origin_host       TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity
  ON sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_cwd
  ON sessions(cwd);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite
  ON sessions(is_favorite) WHERE is_favorite = 1;

CREATE TABLE IF NOT EXISTS tags (
  session_id TEXT NOT NULL,
  tag        TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

CREATE TABLE IF NOT EXISTS project_favorites (
  cwd          TEXT PRIMARY KEY,
  custom_name  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
