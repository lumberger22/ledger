#!/bin/bash
set -e

cd ~/ledger

echo "==> Pulling latest code..."
git pull

echo "==> Building Docker image..."
docker build -t ledger .

echo "==> Verifying Docker image..."
docker image inspect ledger > /dev/null
echo "    Image verified."

echo "==> Stopping old container..."
docker stop ledger 2>/dev/null || true

echo "==> Removing old container..."
docker rm ledger 2>/dev/null || true

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