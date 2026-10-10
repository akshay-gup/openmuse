#!/bin/sh
# A volume is mounted owned by root; the control plane runs as `node`, so hand it the data folder first.
set -e
if [ "$(id -u)" = "0" ]; then
  chown node:node "${CONTROL_DATA_DIR:-/data}" 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
