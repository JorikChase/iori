#!/usr/bin/env bash
# Grants this machine read-only API access to the iori.me / 3die.fr
# Google Analytics 4 properties and Search Console properties.
#
# Run it yourself — it opens a browser and asks you to sign in. Sign in with the
# Google account that already sees both sites at analytics.google.com and
# search.google.com/search-console (most likely jorikchase@gmail.com, NOT a
# krutart work account).
#
#   bash tools/seo-audit/setup_google_auth.sh
#
# It is idempotent: re-running only fixes whatever is missing.
set -euo pipefail

PROJECT_DEFAULT="iori-seo-audit"
SCOPES="https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform"
APIS="analyticsdata.googleapis.com analyticsadmin.googleapis.com searchconsole.googleapis.com"

say() { printf "\n\033[1m==> %s\033[0m\n" "$*"; }

command -v gcloud >/dev/null || { echo "gcloud not found. Install: brew install --cask google-cloud-sdk"; exit 1; }

if [ "${1:-}" = "--adc-only" ]; then
  PROJECT="${2:-iori-seo-audit}"
  say "Granting application credentials (browser sign-in)"
  echo "Sign in as the account that owns the Analytics and Search Console properties."
  gcloud auth application-default login --scopes="$SCOPES"
  gcloud auth application-default set-quota-project "$PROJECT"
  say "Verifying access"
  python3 "$(dirname "$0")/google_report.py" --check
  exit 0
fi

say "1/5  Sign in to the gcloud CLI"
echo "A browser window will open. Choose the account that owns the Analytics and"
echo "Search Console properties for iori.me and 3die.fr."
gcloud auth login --brief

ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
echo "Signed in as: $ACCOUNT"

say "2/5  Pick a Google Cloud project (only used for free API quota)"
PROJECT="${1:-}"
if [ -z "$PROJECT" ]; then
  echo "Projects on this account:"
  gcloud projects list --format='value(projectId)' 2>/dev/null | sed 's/^/  /' || true
  read -r -p "Project id to use [$PROJECT_DEFAULT, created if missing]: " PROJECT
  PROJECT="${PROJECT:-$PROJECT_DEFAULT}"
fi
if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  echo "Creating project $PROJECT ..."
  gcloud projects create "$PROJECT" --name="iori SEO audit"
fi
gcloud config set project "$PROJECT" >/dev/null
echo "Using project: $PROJECT"

say "3/5  Enable the read-only APIs"
for api in $APIS; do
  printf '  %s ... ' "$api"
  gcloud services enable "$api" --project "$PROJECT" >/dev/null 2>&1 && echo "on" || echo "FAILED (enable it by hand in the console)"
done

say "4/5  Grant application credentials (second browser sign-in)"
echo "Use the SAME account as step 1. This is what the report script reads."
gcloud auth application-default login --scopes="$SCOPES"

say "5/5  Attach the quota project"
gcloud auth application-default set-quota-project "$PROJECT"

say "Done — verifying access"
python3 "$(dirname "$0")/google_report.py" --check
