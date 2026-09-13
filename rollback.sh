#!/bin/bash
set -e

# One-command revert to the image server-deploy.sh preserved as
# "ledger:prev" right before its most recent build. Does *not* touch the
# git checkout — this only rolls back the running container/image, which is
# the part that actually serves traffic. If the bad deploy also needs its
# source reverted, do that separately (e.g. `git revert`) before the next
# ./server-deploy.sh run, or this rollback will just be overwritten by the
# same bad build again next time.
#
# Run this ON THE EC2 HOST (same place server-deploy.sh runs), e.g.:
#   ssh -i ~/Downloads/ledger-server.pem ubuntu@<host> "cd ~/ledger && ./rollback.sh"

cd ~/ledger

echo "==> Checking for a preserved previous image..."
if ! docker image inspect ledger:prev > /dev/null 2>&1; then
    echo "ERROR: no ledger:prev image found. Nothing to roll back to."
    echo "       (ledger:prev is only created by server-deploy.sh, right before a build —"
    echo "       there's nothing to restore until at least two deploys have happened.)"
    exit 1
fi

echo "==> Stopping current container..."
docker stop ledger 2>/dev/null || true

echo "==> Removing current container..."
docker rm ledger 2>/dev/null || true

echo "==> Fixing data directory ownership for the previous image's appuser..."
# Same reasoning as server-deploy.sh: the bind-mounted user_data/ needs
# host-side ownership to match whatever UID/GID *this* image's appuser is —
# re-derived here rather than assumed, in case that ever changes between
# builds.
mkdir -p ~/ledger/user_data
APP_UID="$(docker run --rm ledger:prev id -u appuser)"
APP_GID="$(docker run --rm ledger:prev id -g appuser)"
sudo chown -R "${APP_UID}:${APP_GID}" ~/ledger/user_data
echo "    user_data now owned by ${APP_UID}:${APP_GID} (appuser)"

echo "==> Starting container from ledger:prev..."
docker run -d \
  --name ledger \
  -p 8000:8000 \
  --env-file .env \
  -v ~/ledger/user_data:/data \
  ledger:prev

echo "==> Checking container..."
docker ps --filter "name=ledger"

echo "==> Waiting for API..."

for i in {1..30}; do
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null; then
        echo "    API is ready!"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo "ERROR: API failed to start after rollback."
        echo ""
        echo "==> Container logs:"
        docker logs ledger --tail 100
        exit 1
    fi

    sleep 1
done

echo "==> Checking API..."
curl -f http://127.0.0.1:8000/api/health

echo ""
echo "==> Rollback to ledger:prev successful."
echo "    Note: ledger:latest still points at the build that was just rolled"
echo "    back from — running ./server-deploy.sh again without fixing the"
echo "    source first will redeploy the same bad build."
