#!/bin/bash
set -euo pipefail

# Automates what Settings -> Download Backup does manually: a timestamped
# zip of charges.db + settings.json/budget.json/analysis_cache.json (the
# same file set and format /api/settings/backup produces, restorable the
# same way through Settings -> Restore Backup), rotated to keep the last N.
#
# Meant to run ON THE EC2 HOST via cron, reading straight from the
# bind-mounted user_data/ directory — no need to hit the running API or
# manage a key, and it still works if the app container is down. See
# README's "Automated backups" section for the cron line to install.
#
# This protects against "forgot to click download" and in-app data loss (a
# bad restore, an accidental reset). It does NOT protect against losing the
# EC2 instance/volume itself — for that, pair this with an EBS snapshot
# schedule (AWS Backup, or a snapshot Lambda) or set BACKUP_S3_BUCKET below
# for an offsite copy. Neither is set up by this script: both need AWS
# credentials/console access this session doesn't have.

cd ~/ledger

DATA_DIR="${DATA_DIR:-$HOME/ledger/user_data}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/ledger/backups}"
KEEP="${BACKUP_KEEP:-14}"   # keep the last N local backups (default: ~2 weeks of daily runs)
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/ledger-backup-${STAMP}.zip"

mkdir -p "$BACKUP_DIR"

FILES=()
for name in charges.db settings.json budget.json analysis_cache.json; do
    if [ -f "${DATA_DIR}/${name}" ]; then
        FILES+=("${DATA_DIR}/${name}")
    fi
done

if [ ${#FILES[@]} -eq 0 ]; then
    echo "ERROR: no data files found under ${DATA_DIR} — nothing to back up."
    exit 1
fi

# Uses Python's zipfile (same library routers/settings.py's /backup
# endpoint already uses) rather than shelling out to a `zip` binary, which
# isn't guaranteed to be installed on a stock EC2 Ubuntu AMI. python3 is.
python3 - "$OUT" "${FILES[@]}" <<'PYEOF'
import sys
import zipfile
import os

out = sys.argv[1]
files = sys.argv[2:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for f in files:
        zf.write(f, arcname=os.path.basename(f))
PYEOF
echo "Wrote ${OUT}"

# Rotate: keep only the newest $KEEP local backups.
mapfile -t EXISTING < <(ls -1t "${BACKUP_DIR}"/ledger-backup-*.zip 2>/dev/null)
if [ "${#EXISTING[@]}" -gt "$KEEP" ]; then
    for old in "${EXISTING[@]:$KEEP}"; do
        rm -f "$old"
        echo "Pruned ${old}"
    done
fi

# Optional offsite copy — only runs if an S3 bucket is configured *and* the
# aws CLI is present. Neither is required for the local rotation above.
if [ -n "${BACKUP_S3_BUCKET:-}" ] && command -v aws >/dev/null 2>&1; then
    aws s3 cp "$OUT" "s3://${BACKUP_S3_BUCKET}/$(basename "$OUT")" --only-show-errors
    echo "Copied to s3://${BACKUP_S3_BUCKET}/$(basename "$OUT")"
fi
