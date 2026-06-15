#!/bin/bash
cd /Users/abhishekjha/CODE/Nexus\ cortex/hermes-agent
echo "=== state.db tables ==="
sqlite3 /Users/abhishekjha/.hermes/state.db ".tables" 2>/dev/null || echo "sqlite3 not found, trying python"
echo "=== space state.db tables ==="
sqlite3 /Users/abhishekjha/CODE/Nexus\ cortex/hermes-agent/data/spaces/0c16b791-f481-45fb-8935-93877447faf5/state.db ".tables" 2>/dev/null || echo "not available"
