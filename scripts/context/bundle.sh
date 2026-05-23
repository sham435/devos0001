#!/bin/bash
set -e

# DevOS Context Bundle — injects project state into opencode system prompt
# Called by opencode agent pre_run hook.
# Output: bundled markdown at the path in $1 or /tmp/devos-context.md

BUNDLE_OUT="${1:-/tmp/devos-context.md}"
PROJECT_PATH="${PROJECT_PATH:-.}"
DEVOS_HOME="${DEVOS_HOME:-$(cd "$(dirname "$0")/../.." && pwd)}"

echo "# DevOS Context Bundle" > "$BUNDLE_OUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$BUNDLE_OUT"
echo "Device: $(hostname 2>/dev/null || echo 'unknown')" >> "$BUNDLE_OUT"
echo "" >> "$BUNDLE_OUT"

# Bundle core DevOS artifacts
for file in PROJECT_STATE.md ARCHITECTURE.md DECISIONS.md TASKS.md; do
  if [ -f "$PROJECT_PATH/$file" ]; then
    echo "## $file" >> "$BUNDLE_OUT"
    cat "$PROJECT_PATH/$file" >> "$BUNDLE_OUT"
    echo "" >> "$BUNDLE_OUT"
  fi
done

# Detect stack from ARCHITECTURE.md for snippet selection
STACK=""
if [ -f "$PROJECT_PATH/ARCHITECTURE.md" ]; then
  STACK=$(grep -i "language" "$PROJECT_PATH/ARCHITECTURE.md" 2>/dev/null | head -1 | sed 's/.*|//' | xargs | tr '[:upper:]' '[:lower:]')
fi

# Attach relevant snippets (top 3)
if [ -n "$STACK" ] && [ -d "$DEVOS_HOME/snippets/$STACK" ]; then
  echo "## Relevant Snippets from snippets/$STACK/" >> "$BUNDLE_OUT"
  for snippet in $(ls "$DEVOS_HOME/snippets/$STACK" 2>/dev/null | head -3); do
    echo "### $snippet" >> "$BUNDLE_OUT"
    head -30 "$DEVOS_HOME/snippets/$STACK/$snippet" >> "$BUNDLE_OUT"
    echo "" >> "$BUNDLE_OUT"
  done
fi

# Attach recent lessons
if [ -d "$DEVOS_HOME/memory/lessons" ]; then
  echo "## Memory Lessons" >> "$BUNDLE_OUT"
  find "$DEVOS_HOME/memory/lessons" -name "*.md" -newer "$PROJECT_PATH/PROJECT_STATE.md" 2>/dev/null | head -2 | while read lesson; do
    echo "### $(basename "$lesson" .md)" >> "$BUNDLE_OUT"
    head -20 "$lesson" >> "$BUNDLE_OUT"
    echo "" >> "$BUNDLE_OUT"
  done
fi

echo ">>> Context bundle written to $BUNDLE_OUT ($(wc -c < "$BUNDLE_OUT") bytes)"
