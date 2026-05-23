#!/bin/bash
set -e

# DevOS Pre-Task Hook: Run doctor before every opencode task
# Called by opencode provider before task execution.
# Exits non-zero if health check fails — opencode will not run.

PROJECT_NAME="${1:-${DEVOS_PROJECT:-}}"
PROJECT_PATH="${2:-${PROJECT_PATH:-}}"
DEVOS_HOME="${DEVOS_HOME:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [ -z "$PROJECT_NAME" ] && [ -n "$PROJECT_PATH" ]; then
  PROJECT_NAME=$(basename "$PROJECT_PATH")
fi

echo ">>> DevOS Pre-Task Hook: Doctor check for ${PROJECT_NAME:-all}"

# Run doctor — abort if it fails
if [ -n "$PROJECT_NAME" ]; then
  tsx "$DEVOS_HOME/scripts/devos-doctor.ts" "$PROJECT_NAME"
  DOCTOR_EXIT=$?
else
  tsx "$DEVOS_HOME/scripts/devos-doctor.ts"
  DOCTOR_EXIT=$?
fi

if [ $DOCTOR_EXIT -ne 0 ]; then
  echo ""
  echo ">>> DevOS Doctor FAILED — opencode execution aborted."
  echo ">>> Fix the issues above, then re-run the task."
  exit 1
fi

echo ">>> Doctor passed. Starting opencode task..."
exit 0
