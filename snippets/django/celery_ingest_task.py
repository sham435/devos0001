"""
Celery task for async RAG ingestion
Copy to: backend/rag/tasks.py

Setup:
1. pip install celery redis
2. CELERY_BROKER_URL = "redis://localhost:6379/0"
3. Add 'backend.rag' to INSTALLED_APPS
4. celery -A config worker -l info
"""
import tempfile
from pathlib import Path
from celery import shared_task
from django.core.files.storage import default_storage
from django.contrib.auth import get_user_model

from .langgraph_rag import ingest_document

User = get_user_model()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def ingest_uploaded_file(self, user_id: str, s3_path: str, filename: str):
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            with default_storage.open(s3_path, 'rb') as f:
                tmp.write(f.read())
            tmp_path = tmp.name

        import pypdf, docx
        ext = Path(filename).suffix.lower()

        if ext == ".pdf":
            reader = pypdf.PdfReader(tmp_path)
            text = "\n\n".join(
                f"[Page {i+1}]\n{page.extract_text()}"
                for i, page in enumerate(reader.pages)
                if page.extract_text().strip()
            )
        elif ext == ".docx":
            doc = docx.Document(tmp_path)
            text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext in {".txt", ".md"}:
            text = Path(tmp_path).read_text(encoding="utf-8")
        else:
            raise ValueError(f"Unsupported: {ext}")

        doc_id = ingest_document(
            user_id=user_id,
            filename=filename,
            text=text,
            meta={"source": "upload", "s3_path": s3_path}
        )
        Path(tmp_path).unlink()
        return {"status": "success", "document_id": str(doc_id)}

    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task
def reindex_user_documents(user_id: str):
    from django.db import connection
    from .rag_models import Chunk

    count = Chunk.objects.filter(document__user_id=user_id).count()
    lists = max(100, int(count ** 0.5))

    with connection.cursor() as cursor:
        cursor.execute(f"""
            DROP INDEX IF EXISTS chunks_embedding_idx;
            CREATE INDEX CONCURRENTLY chunks_embedding_idx
            ON rag_chunk USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = {lists});
        """)
    return {"status": "reindexed", "lists": lists, "chunks": count}
