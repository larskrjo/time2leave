#!/usr/bin/env bash
#
# pull-env.sh — Hydrate apps/mobile/.env from GCP Secret Manager.
#
# The mobile app's runtime env validator (apps/mobile/src/config/env.ts)
# requires every value below to be present and non-empty; instead of
# hand-authoring apps/mobile/.env, we keep the canonical values in
# Secret Manager and pull them down on demand.
#
# Naming convention:
#   gcp://${PROJECT}/secrets/time2leave-mobile-${MODE}-${VAR_NAME}
#
# Examples:
#   time2leave-mobile-local-EXPO_PUBLIC_API_BASE_URL
#   time2leave-mobile-prod-EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID
#
# Usage:
#   ./apps/mobile/scripts/pull-env.sh local
#   ./apps/mobile/scripts/pull-env.sh prod
#
# Or via the workspace alias:
#   npm run env:pull -- local
#
# Preconditions:
#   - Google Cloud SDK installed and authenticated:
#       brew install --cask google-cloud-sdk
#       gcloud auth login
#       gcloud config set project <YOUR_PROJECT_ID>
#   - The current account has roles/secretmanager.secretAccessor on
#     each secret (or roles/secretmanager.viewer at the project level).
#
# Override the project for this invocation only by setting:
#   TIME2LEAVE_GCP_PROJECT=my-project ./apps/mobile/scripts/pull-env.sh local
#

set -euo pipefail

usage() {
    cat >&2 <<EOF
Usage: $0 <local|prod>

Pulls every required EXPO_PUBLIC_* env var for the chosen mode from
GCP Secret Manager and writes them to apps/mobile/.env.

The first line of the resulting .env is "EXPO_PUBLIC_APP_ENV=<mode>"
(set by the script, not stored in GCP — it's the mode selector).

To set or rotate a single value, use:
  ./apps/mobile/scripts/set-env-var.sh <local|prod> <VAR_NAME>
EOF
    exit 1
}

[[ $# -eq 1 ]] || usage
MODE="$1"
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
    cat >&2 <<EOF
ERROR: No GCP project configured.

Set one of:
  - Permanent default: gcloud config set project <YOUR_PROJECT_ID>
  - Per-invocation:    TIME2LEAVE_GCP_PROJECT=<YOUR_PROJECT_ID> $0 $MODE
EOF
    exit 1
fi

# --- Var lists per mode ----------------------------------------------------
# Keep these in lockstep with apps/mobile/src/config/env.ts. The runtime
# validator is the source of truth; if these drift, the SetupRequired
# screen will still tell the user what's missing — but a strict 1:1
# match avoids that round-trip.

COMMON_VARS=(
    EXPO_PUBLIC_API_BASE_URL
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
)

LOCAL_ONLY_VARS=(
    EXPO_PUBLIC_DEV_LOGIN_EMAIL
)

PROD_ONLY_VARS=(
    EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID
    EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID
)

VARS=("${COMMON_VARS[@]}")
if [[ "$MODE" == "local" ]]; then
    VARS+=("${LOCAL_ONLY_VARS[@]}")
else
    VARS+=("${PROD_ONLY_VARS[@]}")
fi

# --- Output ----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$SCRIPT_DIR/../.env"
TMP="$(mktemp "${TMPDIR:-/tmp}/time2leave-env.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

NAMESPACE="time2leave-mobile-${MODE}"
TIMESTAMP="$(date -u +%FT%TZ)"

cat > "$TMP" <<EOF
# =============================================================================
# AUTO-GENERATED — do not hand-edit and do not commit.
# =============================================================================
# Generated:  $TIMESTAMP
# Source:     gcp://$PROJECT/secrets/${NAMESPACE}-*
# Mode:       $MODE
#
# Regenerate:  npm run env:pull -- $MODE
# Rotate one:  ./apps/mobile/scripts/set-env-var.sh $MODE <VAR_NAME>
#
# This file is matched by .gitignore (**/.env) so it cannot be
# committed by accident.
# =============================================================================

EXPO_PUBLIC_APP_ENV=$MODE
EOF

echo "Project: $PROJECT" >&2
echo "Mode:    $MODE" >&2
echo "" >&2

failed=0
for var in "${VARS[@]}"; do
    secret="${NAMESPACE}-${var}"
    printf "  %-50s ... " "$secret" >&2
    # `--quiet` suppresses gcloud's own progress bar; we surface clean
    # one-line status per variable instead.
    if value=$(gcloud secrets versions access latest \
            --secret="$secret" \
            --project="$PROJECT" \
            --quiet 2>/dev/null); then
        # Reject empty values — Secret Manager allows them but our
        # runtime validator treats them as missing, and silently writing
        # `VAR=` would be misleading.
        if [[ -z "$value" ]]; then
            echo "EMPTY" >&2
            echo "" >&2
            echo "ERROR: Secret '$secret' exists but has an empty value." >&2
            echo "Set a non-empty value with:" >&2
            echo "  ./apps/mobile/scripts/set-env-var.sh $MODE $var" >&2
            failed=1
            break
        fi
        # Write VAR=value with no quoting — Expo's .env loader treats
        # the rest of the line as the literal value, so no escaping
        # required as long as the value has no newline (which Secret
        # Manager doesn't allow in the typical case anyway).
        printf '%s=%s\n' "$var" "$value" >> "$TMP"
        echo "ok" >&2
    else
        echo "MISSING" >&2
        echo "" >&2
        echo "ERROR: Secret '$secret' is not accessible in project '$PROJECT'." >&2
        echo "" >&2
        echo "Either:" >&2
        echo "  - The secret doesn't exist yet — create it with:" >&2
        echo "      ./apps/mobile/scripts/set-env-var.sh $MODE $var" >&2
        echo "  - You don't have permission — grant the running account" >&2
        echo "    roles/secretmanager.secretAccessor on the secret." >&2
        failed=1
        break
    fi
done

if [[ $failed -ne 0 ]]; then
    exit 1
fi

# Atomic move so a partial pull never replaces a working .env.
mv "$TMP" "$OUT"
trap - EXIT
chmod 600 "$OUT"

echo "" >&2
echo "Wrote $OUT (mode=$MODE, $((${#VARS[@]} + 1)) vars)." >&2
echo "Restart 'npm run dev:mobile' so Expo re-reads .env." >&2
