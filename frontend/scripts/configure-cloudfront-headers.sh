#!/usr/bin/env bash
#
# One-time setup: attach a Response Headers Policy to the CloudFront
# distribution so the SPA serves the headers Google Sign-In needs +
# the standard set of SPA security headers.
#
# Why this exists: Google Sign-In opens a popup on accounts.google.com,
# which posts the credential back via window.postMessage. Chrome warns
# (and may eventually block) that postMessage call unless the opener
# page sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` to
# explicitly opt-in. Without this script the distribution serves no
# COOP header and the console fills with COOP warnings.
#
# Idempotent: re-running detects an existing policy with the same name,
# updates it in place, and re-binds it to the distribution if needed.
#
# Run from your local machine. Requires AWS CLI with permissions to
# manage the CloudFront distribution below.

set -euo pipefail

REGION="us-west-2"
CF_DIST_ID="E1XJU7E7JJA9QX"
POLICY_NAME="time2leave-spa-headers"

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

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: '$1' is required but not on PATH." >&2
    exit 127
  fi
}
require aws
require jq

echo "Looking for existing response-headers-policy '$POLICY_NAME'..."
EXISTING_POLICY_ID="$(aws cloudfront list-response-headers-policies \
  --type custom \
  --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$POLICY_NAME'].ResponseHeadersPolicy.Id" \
  --output text \
  --no-cli-pager)"

POLICY_CONFIG_FILE="$(mktemp)"
trap 'rm -f "$POLICY_CONFIG_FILE"' EXIT
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

echo "Attaching policy to distribution $CF_DIST_ID..."
DIST_FILE="$(mktemp)"
trap 'rm -f "$POLICY_CONFIG_FILE" "$DIST_FILE"' EXIT

aws cloudfront get-distribution-config --id "$CF_DIST_ID" --no-cli-pager > "$DIST_FILE"
DIST_ETAG="$(jq -r '.ETag' "$DIST_FILE")"
CURRENT_BOUND_POLICY="$(jq -r '.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId // empty' "$DIST_FILE")"

if [[ "$CURRENT_BOUND_POLICY" == "$POLICY_ID" ]]; then
  echo "Distribution already bound to $POLICY_ID; nothing to do."
else
  # Patch the policy id into the existing config and push it back.
  # We deliberately edit only this single field so the rest of the
  # distribution config (origins, cache behaviors, aliases, etc.)
  # stays exactly as-is.
  UPDATED_CONFIG="$(mktemp)"
  trap 'rm -f "$POLICY_CONFIG_FILE" "$DIST_FILE" "$UPDATED_CONFIG"' EXIT
  jq --arg pid "$POLICY_ID" \
    '.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId = $pid | .DistributionConfig' \
    "$DIST_FILE" > "$UPDATED_CONFIG"

  aws cloudfront update-distribution \
    --id "$CF_DIST_ID" \
    --if-match "$DIST_ETAG" \
    --distribution-config "file://$UPDATED_CONFIG" \
    --no-cli-pager > /dev/null
  echo "Distribution updated. CloudFront will now propagate the change (≈1-3 min)."
fi

echo
echo "Verifying with a curl in 30s..."
sleep 30
curl -sI "https://time2leave.com" | grep -iE 'cross-origin-opener-policy|strict-transport|x-content-type|x-frame|referrer-policy' || echo "(headers not yet visible — give it another minute and re-curl)"
echo
echo "Done."
