#!/usr/bin/env bash
# Dev launcher for Expo Metro on Replit.
#
# Metro must bind to 0.0.0.0 (all interfaces), NOT 127.0.0.1, so that
# Replit's workflow health-check system can detect the open port.
# The --localhost flag restricts Metro to 127.0.0.1 and causes the health
# check to fail, even when Metro is fully running.

set -euo pipefail

echo "[dev-daemon] Starting Metro on all interfaces, port ${PORT:-18115}..."

exec pnpm exec expo start --port "${PORT:-18115}"
