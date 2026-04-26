#!/usr/bin/env bash
# claude-manager hook — captures session metadata.
# Invoked by Claude Code on SessionStart ($1=start) and Stop ($1=stop).
# MUST be silent: never print to stdout or stderr.

set -u
event="${1:-}"
queue="${HOME}/.claudemanager/queue.jsonl"
mkdir -p "$(dirname "$queue")" 2>/dev/null || exit 0

# Read hook input JSON from stdin (best-effort).
input=""
if [ ! -t 0 ]; then
  input=$(cat 2>/dev/null || true)
fi

extract() {
  # extract "key" string value from one-line JSON $input
  local key=$1
  printf '%s' "$input" | sed -n "s/.*\"${key}\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n1
}

session_id=$(extract session_id)
cwd=$(extract cwd)
transcript=$(extract transcript_path)
ts=$(date +%s)
host=$(hostname 2>/dev/null || echo unknown)

[ -z "$session_id" ] && exit 0

# Helper: JSON-escape a string for embedding in a JSON value.
jesc() {
  printf '%s' "$1" | python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.stdin.read())[1:-1])' 2>/dev/null \
    || printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

if [ "$event" = "start" ]; then
  argv_json='["claude"]'
  if [ -r "/proc/${PPID}/cmdline" ]; then
    argv_json=$(tr '\0' '\n' < "/proc/${PPID}/cmdline" | python3 -c 'import sys,json; print(json.dumps([l.rstrip("\n") for l in sys.stdin if l.strip()]))' 2>/dev/null) \
      || argv_json='["claude"]'
  elif command -v ps >/dev/null 2>&1; then
    args=$(ps -o args= -p "$PPID" 2>/dev/null || true)
    if [ -n "$args" ]; then
      argv_json=$(printf '%s' "$args" | python3 -c 'import sys,json,shlex; print(json.dumps(shlex.split(sys.stdin.read().strip())))' 2>/dev/null) \
        || argv_json='["claude"]'
    fi
  fi

  env_json='{}'
  env_json=$(python3 -c 'import os,json; keys=["ANTHROPIC_MODEL","ANTHROPIC_BASE_URL","CLAUDE_CODE_USE_BEDROCK","CLAUDE_CODE_USE_VERTEX","CLAUDE_CODE_MAX_OUTPUT_TOKENS"]; print(json.dumps({k:os.environ[k] for k in keys if k in os.environ}))' 2>/dev/null || echo '{}')

  branch=""
  sha=""
  if [ -n "$cwd" ] && [ -d "$cwd" ]; then
    branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
    sha=$(git -C "$cwd" rev-parse HEAD 2>/dev/null || true)
  fi

  printf '{"event":"start","ts":%s,"session_id":"%s","cwd":"%s","argv":%s,"env":%s,"git":{"branch":"%s","sha":"%s"},"first_prompt":null,"origin_host":"%s"}\n' \
    "$ts" "$(jesc "$session_id")" "$(jesc "$cwd")" "$argv_json" "$env_json" "$(jesc "$branch")" "$(jesc "$sha")" "$(jesc "$host")" \
    >> "$queue" 2>/dev/null || true

elif [ "$event" = "stop" ]; then
  msg_count=0
  tok_count=0
  first_prompt=""
  if [ -n "$transcript" ] && [ -r "$transcript" ]; then
    read -r msg_count tok_count first_prompt <<<"$(python3 -c '
import sys, json
msgs = 0; toks = 0; first = ""
with open(sys.argv[1]) as f:
    for line in f:
        if not line.strip(): continue
        try: o = json.loads(line)
        except: continue
        msgs += 1
        u = (o.get("message") or {}).get("usage") or {}
        toks += int(u.get("input_tokens",0)) + int(u.get("output_tokens",0))
        if not first and (o.get("message") or {}).get("role") == "user":
            content = (o.get("message") or {}).get("content")
            if isinstance(content, str):
                first = content[:200]
            elif isinstance(content, list) and content and isinstance(content[0], dict):
                first = (content[0].get("text") or "")[:200]
print(msgs, toks, first.replace("\n", " "))
' "$transcript" 2>/dev/null || echo "0 0 ")"
  fi
  printf '{"event":"stop","ts":%s,"session_id":"%s","message_count":%s,"token_count":%s,"first_prompt":"%s"}\n' \
    "$ts" "$(jesc "$session_id")" "${msg_count:-0}" "${tok_count:-0}" "$(jesc "${first_prompt:-}")" \
    >> "$queue" 2>/dev/null || true
fi

exit 0
