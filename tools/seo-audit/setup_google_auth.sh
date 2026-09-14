#!/usr/bin/env bash
# Read-only API access to the iori.me / 3die.fr Google Analytics and Search
# Console data, for tools/seo-audit/google_report.py.
#
# We use a SERVICE ACCOUNT, not a browser sign-in. Google blocks gcloud's own
# OAuth client from requesting Analytics and Search Console scopes ("This app is
# blocked"), and a service account also survives token expiry, so scheduled runs
# keep working.
#
#   bash tools/seo-audit/setup_google_auth.sh
#
# Idempotent: re-running only fixes what is missing. The last step is two grants
# you make in the Analytics and Search Console interfaces — the script prints
# exactly what to paste and where.
set -euo pipefail

PROJECT="${1:-iori-seo-audit}"
SA_NAME="seo-reader"
SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
KEY_DIR="$HOME/.config/iori-seo"
KEY="$KEY_DIR/sa-key.json"
APIS="analyticsdata.googleapis.com analyticsadmin.googleapis.com searchconsole.googleapis.com"

say() { printf "\n\033[1m==> %s\033[0m\n" "$*"; }

command -v gcloud >/dev/null || { echo "gcloud not found. Install: brew install --cask google-cloud-sdk"; exit 1; }
command -v openssl >/dev/null || { echo "openssl not found."; exit 1; }

gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || {
  say "Sign in to the gcloud CLI"; gcloud auth login --brief; }
echo "gcloud account: $(gcloud config get-value account 2>/dev/null)"

say "Project"
gcloud projects describe "$PROJECT" >/dev/null 2>&1 || gcloud projects create "$PROJECT" --name="iori SEO audit"
gcloud config set project "$PROJECT" >/dev/null
echo "$PROJECT"

say "APIs"
for api in $APIS; do
  printf '  %-34s ' "$api"
  gcloud services enable "$api" --project "$PROJECT" >/dev/null 2>&1 && echo on || echo "FAILED"
done

say "Service account"
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$SA_NAME" --display-name="iori SEO reader" --project "$PROJECT"
mkdir -p "$KEY_DIR"; chmod 700 "$KEY_DIR"
if [ -s "$KEY" ]; then
  echo "key already at $KEY"
else
  gcloud iam service-accounts keys create "$KEY" --iam-account="$SA_EMAIL" --project "$PROJECT"
fi
chmod 600 "$KEY"

cat <<BANNER

==> TWO GRANTS, IN THE BROWSER (this is the only manual part)

Paste this address into both:

    $SA_EMAIL

1. Google Analytics — for BOTH properties (iori.me and 3die.fr):
   analytics.google.com -> Admin -> Property access management -> "+"
   -> Add users -> paste the address -> role Viewer -> Add
   (untick "Notify new users by email" — a service account has no inbox)

2. Search Console — for BOTH properties:
   search.google.com/search-console -> Settings -> Users and permissions
   -> Add user -> paste the address -> permission Full -> Add

BANNER

say "Verifying"
python3 "$(dirname "$0")/google_report.py" --check
