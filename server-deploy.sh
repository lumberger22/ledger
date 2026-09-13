#!/bin/bash
set -e

cd ~/ledger

echo "==> Pulling latest code..."
git pull

echo "==> Preserving previous image as ledger:prev (for rollback)..."
# Tag whatever's currently "ledger:latest" as "ledger:prev" *before*
# rebuilding overwrites that tag. Lets a bad deploy be undone with
# ./rollback.sh instead of manual git/image archaeology. A no-op (with a
# note, not an error) on the very first deploy, when no ledger image exists
# yet.
if docker image inspect ledger:latest > /dev/null 2>&1; then
    docker tag ledger:latest ledger:prev
    echo "    Tagged current ledger:latest as ledger:prev."
else
    echo "    No existing ledger:latest image — nothing to preserve (first deploy?)."
fi

echo "==> Building Docker image..."
docker build -t ledger .

echo "==> Verifying Docker image..."
docker image inspect ledger > /dev/null
echo "    Image verified."

echo "==> Stopping old container..."
docker stop ledger 2>/dev/null || true

echo "==> Removing old container..."
docker rm ledger 2>/dev/null || true

echo "==> Fixing data directory ownership..."
# The container now runs as a non-root user (see Dockerfile), but
# ~/ledger/user_data is bind-mounted in below, so *host-side* ownership is
# what actually governs write access -- the image's own chown doesn't
# reach a bind mount. Older deploys ran the container as root, so existing
# files here (charges.db included) are likely still root-owned; without
# this step the app would come up but fail to write the database. Reading
# the UID/GID back out of the freshly-built image (rather than hardcoding
# 1000 here too) keeps this correct even if the Dockerfile's user setup
# ever changes. Safe to run every deploy -- a no-op once ownership matches.
mkdir -p ~/ledger/user_data
APP_UID="$(docker run --rm ledger id -u appuser)"
APP_GID="$(docker run --rm ledger id -g appuser)"
sudo chown -R "${APP_UID}:${APP_GID}" ~/ledger/user_data
echo "    user_data now owned by ${APP_UID}:${APP_GID} (appuser)"

echo "==> Starting new container..."
docker run -d \
  --name ledger \
  -p 8000:8000 \
  --env-file .env \
  -v ~/ledger/user_data:/data \
  ledger

echo "==> Checking container..."
docker ps --filter "name=ledger"

echo "==> Waiting for API..."

for i in {1..30}; do
    if curl -sf http://127.0.0.1:8000/api/health > /dev/null; then
        echo "    API is ready!"
        break
    fi

    if [ "$i" -eq 30 ]; then
        echo "ERROR: API failed to start."
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
echo "==> Deployment successful!"