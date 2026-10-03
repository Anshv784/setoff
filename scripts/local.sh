#!/usr/bin/env bash
# Run the whole stack on your machine against a local fork of Arc Testnet.
#
# The fork keeps Arc's real USDC, EURC, Memo and Multicall3From contracts, funds
# the standard anvil accounts with 10,000 USDC each, and costs nothing.
#
#   ./scripts/local.sh            # start fork, deploy, seed invoices, settle a cycle
#   cd web && npm run dev          # then open http://localhost:3000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC=http://127.0.0.1:8545
FORK_URL="${FORK_URL:-https://rpc.testnet.arc.io}"
ANVIL="$(command -v arc-anvil || echo "$HOME/.local/bin/arc-anvil")"
FORGE="$(command -v arc-forge || echo "$HOME/.local/bin/arc-forge")"
CAST="$(command -v arc-cast || echo "$HOME/.local/bin/arc-cast")"
# anvil's well-known dev mnemonic. Only account 9 is used, as the funder: Arc's USDC
# blocklist (inherited by the fork) rejects some of the famous public anvil addresses,
# so demo participants and your test wallet get fresh keys instead.
ANVIL_MNEMONIC="test test test test test test test test test test test junk"

if ! "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1; then
  echo "Starting arc-anvil fork of $FORK_URL on $RPC (log: $ROOT/.anvil.log)"
  "$ANVIL" --fork-url "$FORK_URL" --port 8545 >"$ROOT/.anvil.log" 2>&1 &
  for _ in $(seq 1 30); do "$CAST" chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
fi

FUNDER_PK="$("$CAST" wallet private-key --mnemonic "$ANVIL_MNEMONIC" --mnemonic-index 9)"
# Keep the same demo and test wallets across runs, so wallets already imported into
# MetaMask keep working; generate them only the first time.
if [ -f "$ROOT/.local.env" ]; then
  # shellcheck disable=SC1091
  PREV_MNEMONIC="$(grep '^DEMO_MNEMONIC=' "$ROOT/.local.env" | cut -d'"' -f2)"
  PREV_TESTER_ADDR="$(grep '^TESTER_ADDR=' "$ROOT/.local.env" | cut -d= -f2)"
  PREV_TESTER_PK="$(grep '^TESTER_PK=' "$ROOT/.local.env" | cut -d= -f2)"
  PREV_TESTER2_ADDR="$(grep '^TESTER2_ADDR=' "$ROOT/.local.env" | cut -d= -f2)"
  PREV_TESTER2_PK="$(grep '^TESTER2_PK=' "$ROOT/.local.env" | cut -d= -f2)"
fi
MNEMONIC="${PREV_MNEMONIC:-$("$CAST" wallet new-mnemonic --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["mnemonic"])')}"
if [ -n "${PREV_TESTER_PK:-}" ]; then
  TESTER_ADDR="$PREV_TESTER_ADDR"
  TESTER_PK="$PREV_TESTER_PK"
else
  TESTER_JSON="$("$CAST" wallet new --json)"
  TESTER_ADDR="$(echo "$TESTER_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["address"])')"
  TESTER_PK="$(echo "$TESTER_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["private_key"])')"
fi

echo "Deploying Setoff"
cd "$ROOT/contracts"
DEPLOY_BLOCK="$("$CAST" block-number --rpc-url "$RPC")"
"$FORGE" script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key "$FUNDER_PK" >/dev/null
SETOFF="$(python3 -c "import json;print(json.load(open('broadcast/Deploy.s.sol/5042002/run-latest.json'))['receipts'][0]['contractAddress'])")"
# The fork shares testnet's chain id, so don't leave a local deploy log where the testnet one lives.
git -C "$ROOT" checkout -q -- contracts/broadcast 2>/dev/null || true
echo "Setoff at $SETOFF (from block $DEPLOY_BLOCK)"

LABELS="$(python3 - "$MNEMONIC" "$CAST" <<'PY'
import json, subprocess, sys
mnemonic, cast = sys.argv[1], sys.argv[2]
roles = ["Design studio", "Dev agency", "Print shop", "Courier", "Cafe", "Freelance writer"]
out = {}
for i, r in enumerate(roles):
    a = subprocess.check_output([cast, "wallet", "address", "--mnemonic", mnemonic, "--mnemonic-index", str(i)], text=True).strip()
    out[a.lower()] = r
print(json.dumps(out))
PY
)"

cd "$ROOT/solver"
[ -d node_modules ] || npm ci --silent
export SETOFF_NETWORK=local SETOFF_ADDRESS="$SETOFF" SETOFF_DEPLOY_BLOCK="$DEPLOY_BLOCK"
echo "Seeding 25 invoices between 6 demo wallets"
FUNDER_PK="$FUNDER_PK" DEMO_MNEMONIC="$MNEMONIC" npm run -s demo:seed -- 25 | tail -4
echo "Running the solver"
SOLVER_PK="$FUNDER_PK" npm run -s solve

# A wallet for you to import into MetaMask: 100 USDC for gas and deposits.
"$CAST" send "$TESTER_ADDR" --value 100ether --private-key "$FUNDER_PK" --rpc-url "$RPC" >/dev/null

cat >"$ROOT/.local.env" <<ENV
# Written by scripts/local.sh — local fork only, throwaway keys.
SETOFF_NETWORK=local
SETOFF_ADDRESS=$SETOFF
SETOFF_DEPLOY_BLOCK=$DEPLOY_BLOCK
FUNDER_PK=$FUNDER_PK
SOLVER_PK=$FUNDER_PK
DEMO_MNEMONIC="$MNEMONIC"
TESTER_ADDR=$TESTER_ADDR
TESTER_PK=$TESTER_PK
${PREV_TESTER2_PK:+TESTER2_ADDR=$PREV_TESTER2_ADDR}
${PREV_TESTER2_PK:+TESTER2_PK=$PREV_TESTER2_PK}
ENV

cat >"$ROOT/web/.env.local" <<ENV
NEXT_PUBLIC_SETOFF_NETWORK=local
NEXT_PUBLIC_SETOFF_ADDRESS=$SETOFF
NEXT_PUBLIC_SETOFF_DEPLOY_BLOCK=$DEPLOY_BLOCK
NEXT_PUBLIC_SETOFF_LABELS=$LABELS
ENV

cat <<MSG

Local stack is up. Setoff at $SETOFF on a fork of Arc Testnet ($RPC, chain id 5042002).

  Dashboard   cd web && npm install && npm run dev      -> http://localhost:3000
  More IOUs   cd solver && set -a && . ../.local.env && set +a && npm run demo:seed -- 20
  New cycle   (same shell) npm run solve
  MetaMask    add network: RPC $RPC, chain id 5042002, symbol USDC
              import the test wallet $TESTER_ADDR (100 USDC) — its key is TESTER_PK in .local.env
  Stop        pkill -f arc-anvil
MSG
