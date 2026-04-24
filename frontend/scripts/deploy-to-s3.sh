#!/usr/bin/env bash
#
# Build the frontend SPA and deploy it to S3 + invalidate CloudFront.
#
# This is a *local machine* script. It needs:
#   - Node/npm (to build the SPA)
#   - AWS CLI with credentials for the account that owns the S3 bucket and
#     CloudFront distribution below
#
# Do NOT run this on the backend EC2 host — that box has neither Node nor
# the right AWS credentials. Backend deploys use backend/scripts/build-and-deploy.sh.

set -euo pipefail

BUCKET="traffic-larsjohansen-frontend"
REGION="us-west-2"
CF_DIST_ID="E1XJU7E7JJA9QX"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$FRONTEND_DIR/build/client"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' is required but not found on PATH." >&2
    echo "       $2" >&2
    exit 127
  fi
}

require npm "Install Node 20+ locally. This script is meant to run on your dev machine, not on EC2."
require aws "Install the AWS CLI and configure credentials with access to bucket '$BUCKET' and CloudFront '$CF_DIST_ID'."

cd "$FRONTEND_DIR"

echo "Building SPA in $FRONTEND_DIR..."
npm run build

echo "Syncing static assets to s3://$BUCKET (immutable cache)..."
aws s3 sync "$BUILD_DIR" "s3://$BUCKET" \
  --delete \
  --exclude index.html \
  --cache-control "public,max-age=31536000,immutable" \
  --region "$REGION"

echo "Uploading index.html with no-cache..."
aws s3 cp "$BUILD_DIR/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache" \
  --region "$REGION"

INV_ID="$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths '/*' \
  --query 'Invalidation.Id' \
  --output text \
  --no-cli-pager)"
echo "CloudFront invalidation started: $INV_ID"

aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DIST_ID" \
  --id "$INV_ID" \
  --no-cli-pager

echo "Deployment complete."
