#!/usr/bin/env bash
#
# set-env-var.sh — Create or rotate a single env var in GCP Secret Manager.
#
# Prompts for the value (silent input — the value never appears on
# screen and never lands in shell history) and either:
#   - creates the secret if it doesn't exist, or
#   - adds a new version if it does.
#
# Usage:
#   ./apps/mobile/scripts/set-env-var.sh local EXPO_PUBLIC_API_BASE_URL
#   ./apps/mobile/scripts/set-env-var.sh prod  EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID
#
# After all required vars are set, hydrate apps/mobile/.env with:
#   ./apps/mobile/scripts/pull-env.sh <local|prod>
#

set -euo pipefail

usage() {
    cat >&2 <<EOF
Usage: $0 <local|prod> <VAR_NAME>

Creates or updates the GCP Secret Manager entry
  time2leave-mobile-<MODE>-<VAR_NAME>
in the currently configured GCP project. You'll be prompted for the
value; it's read silently (no echo, no shell history).

Required vars per mode:
  local:
    EXPO_PUBLIC_API_BASE_URL
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    EXPO_PUBLIC_DEV_LOGIN_EMAIL
  prod:
    EXPO_PUBLIC_API_BASE_URL
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID
    EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID
EOF
    exit 1
}

[[ $# -eq 2 ]] || usage
MODE="$1"
VAR="$2"
case "$MODE" in
    local|prod) ;;
    *) usage ;;
esac

if ! command -v gcloud >/dev/null 2>&1; then
    echo "ERROR: gcloud CLI not found." >&2
    echo "Install it with: brew install --cask google-cloud-sdk" >&2
    exit 1
fi

PROJECT="${TIME2LEAVE_GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
    echo "ERROR: No GCP project configured." >&2
    echo "  gcloud config set project <YOUR_PROJECT_ID>" >&2
    exit 1
fi

SECRET="time2leave-mobile-${MODE}-${VAR}"

# Read value silently. Use `read -s` (bash) which works on macOS bash 3.2.
echo "Setting $SECRET in project $PROJECT" >&2
echo "Type the value, then press Enter (input hidden). Ctrl-C to abort." >&2
printf "  %s = " "$VAR" >&2
IFS= read -rs VALUE
echo "" >&2

if [[ -z "$VALUE" ]]; then
    echo "ERROR: Empty values are rejected (the runtime validator treats them as missing)." >&2
    exit 1
fi

# Create the secret if it doesn't exist; otherwise add a new version.
if gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
    echo "Secret exists — adding a new version." >&2
    printf '%s' "$VALUE" | gcloud secrets versions add "$SECRET" \
        --data-file=- \
        --project="$PROJECT" >/dev/null
    echo "OK: added new version of $SECRET." >&2
else
    echo "Secret does not exist — creating it." >&2
    printf '%s' "$VALUE" | gcloud secrets create "$SECRET" \
        --data-file=- \
        --replication-policy="automatic" \
        --project="$PROJECT" >/dev/null
    echo "OK: created $SECRET." >&2
fi

# Wipe the value from this shell's environment as soon as we're done
# with it; otherwise it lingers in /proc/<pid>/environ.
unset VALUE

echo "" >&2
echo "Run './apps/mobile/scripts/pull-env.sh $MODE' to refresh apps/mobile/.env." >&2
