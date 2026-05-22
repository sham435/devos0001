#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./create-project.sh project-name"
  exit 1
fi

PROJECT_PATH="projects/active/$1"
mkdir -p "$PROJECT_PATH"
cp -r templates/project-template/* "$PROJECT_PATH"

# Stamp date
DATE=$(date +%Y-%m-%d)
sed -i '' "s/Updated:.*/Updated: $DATE/" "$PROJECT_PATH/PROJECT_STATE.md"

echo "✅ Project created: $PROJECT_PATH"
echo "Next: cd $PROJECT_PATH && code ."
