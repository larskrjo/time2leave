#!/usr/bin/env bash
#
# One-time CloudFront setup for hosting the SPA. Configures two things
# on the distribution that aren't part of the per-deploy artifact pipe:
#
#   1. Response Headers Policy (named below) attached to the default
#      cache behavior. Sets `Cross-Origin-Opener-Policy:
#      same-origin-allow-popups` (Google Sign-In needs this so the
#      popup's window.postMessage callback isn't blocked) plus standard
#      SPA hardening: HSTS, nosniff, frame-options, referrer-policy.
#
#   2. CustomErrorResponses that rewrite S3's 403 / 404 → /index.html
#      with HTTP 200, so deep links like /trips or /trips/42 are
#      handed to the React Router SPA instead of returning a static
#      "not found" page from S3.
#
# Idempotent: re-running detects existing config, updates only what
# drifted, leaves origins / aliases / cache behaviors untouched.
#
# Run from your local machine. Requires AWS CLI + jq + creds for the
# distribution below.

set -euo pipefail

REGION="us-west-2"
CF_DIST_ID="E1XJU7E7JJA9QX"
POLICY_NAME="time2leave-spa-headers"

# ---------------------------------------------------------------------------
# Response Headers Policy config
# ---------------------------------------------------------------------------

# `Cross-Origin-Opener-Policy: same-origin-allow-popups` is the value
# explicitly recommended by Google for GSI hosts. The HSTS / nosniff /
# referrer-policy / frame-options block is the standard SPA hardening
# set; tune if a future feature needs different defaults.
build_policy_config() {
  cat <<EOF
{
  "Name": "$POLICY_NAME",
  "Comment": "SPA hardening + COOP=same-origin-allow-popups for GSI.",
  "SecurityHeadersConfig": {
    "ContentTypeOptions": { "Override": true },
    "FrameOptions": { "FrameOption": "SAMEORIGIN", "Override": true },
    "ReferrerPolicy": {
      "ReferrerPolicy": "strict-origin-when-cross-origin",
      "Override": true
    },
    "StrictTransportSecurity": {
      "AccessControlMaxAgeSec": 31536000,
      "IncludeSubdomains": true,
      "Preload": false,
      "Override": true
    }
  },
  "CustomHeadersConfig": {
    "Quantity": 1,
    "Items": [
      {
        "Header": "Cross-Origin-Opener-Policy",
        "Value": "same-origin-allow-popups",
        "Override": true
      }
    ]
  }
}
EOF
}

# ---------------------------------------------------------------------------
# CustomErrorResponses: SPA fallback to /index.html for client-side routes
# ---------------------------------------------------------------------------
#
# Rewrite both 403 (S3 default for "object not found" without
# public-read) and 404 to /index.html with status 200. ErrorCachingMinTTL
# is short (10s) so a freshly-deployed index.html surfaces fast — the
# CloudFront default of 10 minutes can otherwise leave users on a stale
# bundle for a frustratingly long time.
SPA_ERROR_RESPONSES_JSON='{
  "Quantity": 2,
  "Items": [
    {
      "ErrorCode": 403,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 10
    },
    {
      "ErrorCode": 404,
      "ResponsePagePath": "/index.html",
      "ResponseCode": "200",
      "ErrorCachingMinTTL": 10
    }
  ]
}'

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' is required but not on PATH." >&2
    exit 127
  fi
}
require aws
require jq

# ---------------------------------------------------------------------------
# Step 1: ensure response headers policy exists (create or update in place).
# ---------------------------------------------------------------------------

echo "Looking for existing response-headers-policy '$POLICY_NAME'..."
EXISTING_POLICY_ID="$(aws cloudfront list-response-headers-policies \
  --type custom \
  --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$POLICY_NAME'].ResponseHeadersPolicy.Id" \
  --output text \
  --no-cli-pager)"

POLICY_CONFIG_FILE="$(mktemp)"
DIST_FILE="$(mktemp)"
UPDATED_CONFIG="$(mktemp)"
trap 'rm -f "$POLICY_CONFIG_FILE" "$DIST_FILE" "$UPDATED_CONFIG"' EXIT

build_policy_config > "$POLICY_CONFIG_FILE"

if [[ -z "$EXISTING_POLICY_ID" || "$EXISTING_POLICY_ID" == "None" ]]; then
  echo "Creating new policy..."
  POLICY_ID="$(aws cloudfront create-response-headers-policy \
    --response-headers-policy-config "file://$POLICY_CONFIG_FILE" \
    --query 'ResponseHeadersPolicy.Id' \
    --output text \
    --no-cli-pager)"
  echo "Created policy: $POLICY_ID"
else
  POLICY_ID="$EXISTING_POLICY_ID"
  echo "Updating existing policy: $POLICY_ID"
  ETAG="$(aws cloudfront get-response-headers-policy \
    --id "$POLICY_ID" \
    --query 'ETag' \
    --output text \
    --no-cli-pager)"
  aws cloudfront update-response-headers-policy \
    --id "$POLICY_ID" \
    --if-match "$ETAG" \
    --response-headers-policy-config "file://$POLICY_CONFIG_FILE" \
    --no-cli-pager > /dev/null
  echo "Updated policy."
fi

# ---------------------------------------------------------------------------
# Step 2: patch the distribution. Single update-distribution call that
# attaches the policy AND installs the SPA error responses if needed.
# ---------------------------------------------------------------------------

echo "Inspecting distribution $CF_DIST_ID..."
aws cloudfront get-distribution-config --id "$CF_DIST_ID" --no-cli-pager > "$DIST_FILE"
DIST_ETAG="$(jq -r '.ETag' "$DIST_FILE")"

CURRENT_BOUND_POLICY="$(jq -r '.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId // empty' "$DIST_FILE")"
CURRENT_ERR_QTY="$(jq -r '.DistributionConfig.CustomErrorResponses.Quantity' "$DIST_FILE")"
CURRENT_ERR_NORMALIZED="$(jq -c '
  .DistributionConfig.CustomErrorResponses.Items // []
  | map({
      ErrorCode,
      ResponsePagePath,
      ResponseCode,
      ErrorCachingMinTTL
    })
  | sort_by(.ErrorCode)
' "$DIST_FILE")"
DESIRED_ERR_NORMALIZED="$(echo "$SPA_ERROR_RESPONSES_JSON" | jq -c '.Items | sort_by(.ErrorCode)')"

NEEDS_UPDATE=false
if [[ "$CURRENT_BOUND_POLICY" != "$POLICY_ID" ]]; then
  echo "  - response-headers-policy: needs to be attached"
  NEEDS_UPDATE=true
else
  echo "  - response-headers-policy: already attached"
fi
if [[ "$CURRENT_ERR_NORMALIZED" != "$DESIRED_ERR_NORMALIZED" ]]; then
  echo "  - custom-error-responses (SPA fallback): needs to be (re)configured ($CURRENT_ERR_QTY existing rules)"
  NEEDS_UPDATE=true
else
  echo "  - custom-error-responses (SPA fallback): already configured"
fi

if [[ "$NEEDS_UPDATE" == "false" ]]; then
  echo "Distribution already up to date; nothing to do."
else
  jq --arg pid "$POLICY_ID" --argjson err "$SPA_ERROR_RESPONSES_JSON" \
    '.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId = $pid
     | .DistributionConfig.CustomErrorResponses = $err
     | .DistributionConfig' \
    "$DIST_FILE" > "$UPDATED_CONFIG"

  aws cloudfront update-distribution \
    --id "$CF_DIST_ID" \
    --if-match "$DIST_ETAG" \
    --distribution-config "file://$UPDATED_CONFIG" \
    --no-cli-pager > /dev/null
  echo "Distribution updated. Invalidating cache so new error rules apply immediately..."
  aws cloudfront create-invalidation \
    --distribution-id "$CF_DIST_ID" \
    --paths '/*' \
    --no-cli-pager > /dev/null
  echo "CloudFront propagation: ~1-3 minutes."
fi

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

echo
echo "Verifying with curl in 30s..."
sleep 30

echo
echo "[ headers ]"
curl -sI "https://time2leave.com" \
  | grep -iE 'cross-origin-opener-policy|strict-transport|x-content-type|x-frame|referrer-policy' \
  || echo "(headers not yet visible — give it another minute)"

echo
echo "[ SPA fallback for deep link /trips ]"
curl -sI "https://time2leave.com/trips" | head -5

echo
echo "Done."
