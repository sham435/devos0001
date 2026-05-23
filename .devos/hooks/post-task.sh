#!/bin/bash
set -e

# DevOS Post-Task Hook: Auto-sync state after every opencode task
# Called by opencode provider after task execution.
# Pushes PROJECT_STATE.md changes to devos-state branch.

PROJECT_NAME="${1:-${DEVOS_PROJECT:-}}"
PROJECT_PATH="${2:-${PROJECT_PATH:-}}"
DEVOS_HOME="${DEVOS_HOME:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [ -z "$PROJECT_NAME" ] && [ -n "$PROJECT_PATH" ]; then
  PROJECT_NAME=$(basename "$PROJECT_PATH")
fi

if [ -z "$PROJECT_NAME" ]; then
  echo ">>> DevOS Post-Task Hook: No project specified, skipping sync"
  exit 0
fi

PROJECT_DIR="$DEVOS_HOME/projects/active/$PROJECT_NAME"
echo ">>> DevOS Post-Task Hook: Syncing $PROJECT_NAME"

# Check if sync branch exists; if not, skip silently
if ! git -C "$PROJECT_DIR" rev-parse --verify devos-state >/dev/null 2>&1; then
  echo ">>> No devos-state branch — creating initial sync branch"
  git -C "$PROJECT_DIR" checkout --orphan devos-state 2>/dev/null
  git -C "$PROJECT_DIR" rm -rf . >/dev/null 2>&1 || true
  git -C "$PROJECT_DIR" commit --allow-empty -m "init devos-state" >/dev/null 2>&1 || true
  git -C "$PROJECT_DIR" checkout main >/dev/null 2>&1 || true
fi

# Push state files to devos-state branch
BRANCH_EXISTS=$(git -C "$PROJECT_DIR" branch --list devos-state)
if [ -n "$BRANCH_EXISTS" ]; then
  DEVICE=$(hostname 2>/dev/null || echo "unknown")

  git -C "$PROJECT_DIR" checkout devos-state 2>/dev/null || git -C "$PROJECT_DIR" checkout -b devos-state

  for file in PROJECT_STATE.md PROMPTS_USED.md TASKS.md; do
    if [ -f "$PROJECT_DIR/$file" ]; then
      git -C "$PROJECT_DIR" add "$file" 2>/dev/null || true
    fi
  done

  git -C "$PROJECT_DIR" commit -m "sync: $DEVICE @ $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || true

  git -C "$PROJECT_DIR" push origin devos-state 2>/dev/null || echo ">>> Sync push skipped (no remote)"

  git -C "$PROJECT_DIR" checkout main 2>/dev/null || true
  echo ">>> State synced to devos-state branch"
else
  echo ">>> Skipping sync (no devos-state branch)"
fi

exit 0
