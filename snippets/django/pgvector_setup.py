"""
Django pgvector setup for RAG v1
Copy to: backend/rag/setup.py or run as management command

Usage:
1. pip install pgvector psycopg2-binary
2. Add 'pgvector.django' to INSTALLED_APPS
3. Run: python manage.py shell < snippets/django/pgvector_setup.py
"""
from django.db import connection
from django.conf import settings
import os

def enable_pgvector():
    """Enable pgvector extension. Run once per DB."""
    with connection.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    print("✅ pgvector extension enabled")

def create_indexes(lists=100):
    """
    Create ivfflat index. Run AFTER bulk inserting chunks.
    lists = sqrt(total_rows) is good default. For 100k chunks, use 316.
    """
    sql = f"""
    CREATE INDEX CONCURRENTLY IF NOT EXISTS chunks_embedding_idx
    ON rag_chunk USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = {lists});

    CREATE INDEX CONCURRENTLY IF NOT EXISTS chunks_document_id_idx
    ON rag_chunk (document_id);

    CREATE INDEX CONCURRENTLY IF NOT EXISTS chunks_meta_gin_idx
    ON rag_chunk USING gin(meta);
    """
    with connection.cursor() as cursor:
        cursor.execute(sql)
    print(f"✅ ivfflat index created with lists={lists}")

def warm_index():
    """Warm cache. Run on deploy to avoid 800ms cold queries."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM rag_chunk ORDER BY embedding LIMIT 1;")
    print("✅ Index warmed")

def health_check():
    """Verify setup"""
    with connection.cursor() as cursor:
        cursor.execute("SELECT extname FROM pg_extension WHERE extname='vector';")
        if not cursor.fetchone():
            raise Exception("pgvector not installed")

        cursor.execute("SELECT COUNT(*) FROM rag_chunk;")
        count = cursor.fetchone()[0]
        print(f"✅ pgvector OK. Chunks: {count}")

        cursor.execute("""
            SELECT indexname FROM pg_indexes
            WHERE tablename='rag_chunk' AND indexname LIKE '%embedding%';
        """)
        if not cursor.fetchone():
            print("⚠️ Warning: No vector index. Run create_indexes()")
        else:
            print("✅ Vector index exists")

if __name__ == "__main__":
    import sys
    cmd = sys.argv[1] if len(sys.argv) > 1 else "health"

    if cmd == "enable":
        enable_pgvector()
    elif cmd == "index":
        lists = int(sys.argv[2]) if len(sys.argv) > 2 else 100
        create_indexes(lists)
    elif cmd == "warm":
        warm_index()
    elif cmd == "health":
        health_check()
    else:
        print("Usage: python pgvector_setup.py [enable|index|warm|health]")
