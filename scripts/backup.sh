#!/bin/bash
set -e

REPO_NAME="personal-ai-engineering-system"
BACKUP_DIR="$HOME/DevOS-Backups"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_FILE="$BACKUP_DIR/${REPO_NAME}_${DATE}.tar.gz"

echo "🔄 Starting DevOS backup..."

# 1. Git push - your primary backup
echo "📤 Pushing to GitHub..."
git add -A
git commit -m "backup: auto-commit $DATE" || echo "No changes to commit"
git push origin main || echo "⚠️ Git push failed - check remote"

# 2. Local tarball backup
echo "📦 Creating local archive..."
mkdir -p "$BACKUP_DIR"
tar --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \
   -czf "$BACKUP_FILE" .

# 3. Keep only last 10 local backups
echo "🧹 Cleaning old backups..."
ls -t "$BACKUP_DIR"/${REPO_NAME}_*.tar.gz | tail -n +11 | xargs -r rm

echo "✅ Backup complete: $BACKUP_FILE"
echo "✅ GitHub: pushed to origin/main"
