#!/bin/bash
set -e

echo "==> Deploying to EC2..."
ssh -i ~/Downloads/ledger-server.pem ubuntu@18.207.184.109 \
  "cd ~/ledger && ./server-deploy.sh"

echo "==> Deployment complete!"