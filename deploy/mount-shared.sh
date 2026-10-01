#!/bin/bash
# Mounts whatever shared storage is configured in /etc/hive/mounts.env
# (either, both, or neither). Run by hive-mounts.service.
set -euo pipefail

mkdir -p /mnt/hive-shared/gcs /mnt/hive-shared/drive

if [ -n "${GCS_BUCKET:-}" ]; then
  if ! mountpoint -q /mnt/hive-shared/gcs; then
    gcsfuse --implicit-dirs "$GCS_BUCKET" /mnt/hive-shared/gcs
  fi
fi

if [ -n "${RCLONE_DRIVE_REMOTE:-}" ]; then
  if ! mountpoint -q /mnt/hive-shared/drive; then
    rclone mount "$RCLONE_DRIVE_REMOTE" /mnt/hive-shared/drive \
      --config /etc/hive/rclone.conf \
      --daemon --vfs-cache-mode writes --allow-other
  fi
fi
