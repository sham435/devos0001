#!/usr/bin/env python3
"""
CLI for ingesting documents into your RAG system.
Makes snippets/django/langgraph_rag.py usable from terminal.

Usage:
  python scripts/ingest_cli.py docs/report.pdf --user-id 123e4567-e89b-12d3-a456-426614174000
  python scripts/ingest_cli.py docs/ --dir --user-id <uuid>
  python scripts/ingest_cli.py docs/contract.pdf --user-id <uuid> --meta '{"case": "123"}'

Setup:
  pip install pypdf python-docx tqdm
  export DJANGO_SETTINGS_MODULE=config.settings
"""
import os
import sys
import argparse
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.append(str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from snippets.django.langgraph_rag import ingest_document
from tqdm import tqdm

SUPPORTED_EXT = {".pdf", ".txt", ".md", ".docx"}

def extract_text(file_path: Path) -> str:
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        import pypdf
        reader = pypdf.PdfReader(file_path)
        text = []
        for i, page in enumerate(reader.pages):
            content = page.extract_text()
            if content.strip():
                text.append(f"[Page {i+1}]\n{content}")
        return "\n\n".join(text)
    elif ext == ".docx":
        import docx
        doc = docx.Document(file_path)
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    elif ext in {".txt", ".md"}:
        return file_path.read_text(encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {ext}")

def ingest_file(file_path: Path, user_id: str, base_meta: dict):
    try:
        text = extract_text(file_path)
        if not text.strip():
            print(f" Skipping empty: {file_path.name}")
            return None
        meta = {**base_meta, "source_path": str(file_path)}
        doc_id = ingest_document(user_id=user_id, filename=file_path.name, text=text, meta=meta)
        return doc_id
    except Exception as e:
        print(f" {file_path.name}: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Ingest docs into RAG")
    parser.add_argument("path", help="File or directory path")
    parser.add_argument("--user-id", required=True, help="UUID of owner")
    parser.add_argument("--dir", action="store_true", help="Ingest all supported files in dir")
    parser.add_argument("--meta", type=str, default="{}", help="JSON metadata to attach to all docs")
    args = parser.parse_args()

    try:
        uuid.UUID(args.user_id)
        base_meta = json.loads(args.meta)
    except ValueError as e:
        print(f" Invalid --user-id or --meta: {e}")
        sys.exit(1)

    path = Path(args.path)
    if not path.exists():
        print(f" Path not found: {path}")
        sys.exit(1)

    files = []
    if args.dir:
        files = [f for f in path.rglob("*") if f.is_file() and f.suffix.lower() in SUPPORTED_EXT]
    else:
        if path.suffix.lower() in SUPPORTED_EXT:
            files = [path]
        else:
            print(f" Unsupported file type. Use: {SUPPORTED_EXT}")
            sys.exit(1)

    if not files:
        print(" No supported files found")
        sys.exit(1)

    print(f" Ingesting {len(files)} files for user {args.user_id}")
    success = 0
    for file in tqdm(files, desc="Processing"):
        if ingest_file(file, args.user_id, base_meta):
            success += 1

    print(f"\n Done: {success}/{len(files)} files ingested")

if __name__ == "__main__":
    main()
