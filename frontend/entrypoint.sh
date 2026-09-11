#!/bin/sh
set -e

echo "Starting Vite dev server (HMR) on 0.0.0.0:5173..."
echo "==============================================="

# --host makes Vite listen on 0.0.0.0 so it's reachable from outside the container.
exec npm run dev -- --host 0.0.0.0 --port 5173
