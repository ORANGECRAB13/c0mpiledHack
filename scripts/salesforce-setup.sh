#!/usr/bin/env bash
# One-shot Salesforce setup: deploy the compliance fields, grant access, seed data.
#
#   sf org login web --alias trial     # you run this once, it opens a browser
#   ./scripts/salesforce-setup.sh trial
#
# Safe to re-run: the deploy is idempotent and the seed upserts by external id.
set -euo pipefail

ALIAS="${1:-trial}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The cmux shell exports a NODE_OPTIONS preload that the CLI's bundled node
# cannot resolve; clear it so every sf call starts clean.
unset NODE_OPTIONS
export CMUX_QUIET=1

echo "==> Target org"
sf org display --target-org "$ALIAS" --json | python3 -c \
  "import json,sys; r=json.load(sys.stdin)['result']; print('   ', r['username'], '·', r['instanceUrl'])"

echo "==> Deploying custom fields and permission set"
cd "$ROOT/salesforce"
sf project deploy start --target-org "$ALIAS" --wait 10

echo "==> Assigning the permission set to the running user"
sf org assign permset --name Vocare_Compliance --target-org "$ALIAS" 2>&1 \
  | grep -v "Duplicate" || true

echo "==> Seeding customer records"
cd "$ROOT"
for file in salesforce/data/*.json; do
  node scripts/salesforce-seed.mjs "$file" --alias "$ALIAS"
done

echo "==> Done. Open the record in Salesforce:"
sf org open --target-org "$ALIAS" --path /lightning/o/Account/list --url-only 2>/dev/null || true
