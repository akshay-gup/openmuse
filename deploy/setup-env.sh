#!/bin/bash
# Generates /etc/hive/hive.env with random internal secrets and prints the
# sign-in key. Idempotent: existing values are never overwritten (rotating
# TOKEN_ENCRYPTION_KEY would orphan already-encrypted credentials).
# The only thing you fill in by hand is MODEL + its provider key.
set -euo pipefail

ENV_FILE="${1:-/etc/hive/hive.env}"
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

get() { grep "^$1=" "$ENV_FILE" | cut -d= -f2-; }
gen() { # gen VAR 'command that prints the value'
  if [ -z "$(get "$1")" ]; then
    printf '%s=%s\n' "$1" "$(eval "$2")" >> "$ENV_FILE"
  fi
}

gen HIVE_ACCESS_KEY 'openssl rand -hex 32'
gen TOKEN_ENCRYPTION_KEY 'openssl rand -base64 32'
gen OPENCODE_SERVER_PASSWORD 'openssl rand -hex 32'

if [ -z "$(get WORKSPACE_MODE)" ]; then
  cat >> "$ENV_FILE" <<'EOF'
WORKSPACE_MODE=live
HOST=127.0.0.1
PORT=8787
PUBLIC_API_URL=https://hive.example.com
AGENT_BACKEND=opencode
OPENCODE_SERVER_URL=http://127.0.0.1:4096
AGENT_MENTION=@hive
# --- fill in by hand ---
# MODEL=openai/gpt-5
# OPENAI_API_KEY=<redacted>
EOF
fi

echo "hive.env ready at $ENV_FILE"
echo
echo "Your Hive sign-in key (save this):"
get HIVE_ACCESS_KEY
echo
echo "Still to fill in: MODEL + provider key, and PUBLIC_API_URL."
