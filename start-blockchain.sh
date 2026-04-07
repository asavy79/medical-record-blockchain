#!/usr/bin/env bash
#
# Start the local Anvil blockchain and deploy the MedicalAccessRegistry contract.
#
# Prerequisites:
#   - foundry installed (curl -L https://foundry.paradigm.xyz | bash && foundryup)
#
# Usage:
#   ./start-blockchain.sh
#
# After this script finishes, the contract address is printed and saved to .env.
# If docker-compose is already running, restart the backend to pick up the new address:
#   docker compose restart backend
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ONCHAIN_DIR="$SCRIPT_DIR/onchain"
ENV_FILE="$SCRIPT_DIR/.env"
ANVIL_PORT=8545

# ── 1. Start Anvil in the background ─────────────────────────────────────────

echo "Starting Anvil on port $ANVIL_PORT..."

# Kill any existing Anvil on this port
lsof -ti :"$ANVIL_PORT" | xargs kill -9 2>/dev/null || true

anvil --port "$ANVIL_PORT" &
ANVIL_PID=$!

# Wait for Anvil to be ready
for i in $(seq 1 30); do
  if curl -sf http://localhost:$ANVIL_PORT -X POST \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "Anvil running (PID $ANVIL_PID)"

# ── 2. Deploy the contract ───────────────────────────────────────────────────

echo "Deploying MedicalAccessRegistry..."

cd "$ONCHAIN_DIR"

# Use Anvil's first default private key for deployment
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

DEPLOY_OUTPUT=$(forge script script/DeployMedicalAccess.s.sol:DeployMedicalAccess \
  --rpc-url "http://localhost:$ANVIL_PORT" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast 2>&1)

# Extract the contract address from forge output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{40}' | tail -1)

if [ -z "$CONTRACT_ADDRESS" ]; then
  echo "ERROR: Could not extract contract address from deployment output:"
  echo "$DEPLOY_OUTPUT"
  kill $ANVIL_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "========================================="
echo "  Contract deployed!"
echo "  Address: $CONTRACT_ADDRESS"
echo "========================================="
echo ""

# ── 3. Write to .env ─────────────────────────────────────────────────────────

# Update or create the .env file
if [ -f "$ENV_FILE" ]; then
  # Remove existing CONTRACT_ADDRESS line if present
  grep -v '^CONTRACT_ADDRESS=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> "$ENV_FILE"

echo "Saved to $ENV_FILE"
echo ""
echo "If docker-compose is running, restart the backend to pick up the address:"
echo "  docker compose restart backend"
echo ""
echo "Anvil is running in the background (PID $ANVIL_PID)."
echo "To stop it: kill $ANVIL_PID"
echo ""

# Keep Anvil in the foreground so ctrl-c stops it
wait $ANVIL_PID
