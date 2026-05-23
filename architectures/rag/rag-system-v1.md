# RAG System v1 — Postgres + pgvector

## Goal
Chat with private docs. <2s latency, <$50/mo, 100k chunks. No vendor lock-in.

## Architecture Diagram
```
User → Next.js → FastAPI → Postgres/pgvector
                         ↓
              Redis Queue → Celery Worker
                         ↓
              OpenAI Embed → Chunk → Store
```

## Tech Stack
| Layer | Tech | Why |
| --- | --- | --- |
| **Vector DB** | Postgres 16 + pgvector 0.7 | Keep vectors + metadata in 1 DB. Joins are free. Avoid Pinecone $70/mo |
| **Embedding** | `text-embedding-3-small` | 1536d, $0.02/1M tokens. Good recall vs `ada-002` |
| **Chunking** | LangChain `RecursiveCharacterTextSplitter` | Size: 800, Overlap: 100. Respects markdown headers |
| **Orchestration** | LangGraph | Need state for multi-step: retrieve → rerank → generate |
| **Reranker** | `cohere/rerank-english-v3.0` | +20% accuracy on top-20 → top-5. Worth $1/1k searches |
| **Queue** | Celery + Redis | Async ingestion. Don't block upload endpoint |
| **Cache** | Redis | Cache queries: `query_hash → doc_ids` for 10min |

## Data Model
```sql
CREATE EXTENSION vector;

CREATE TABLE documents (
   id UUID PRIMARY KEY,
   user_id UUID NOT NULL,
   filename TEXT,
   s3_path TEXT,
   created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chunks (
   id UUID PRIMARY KEY,
   document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
   content TEXT NOT NULL,
   embedding vector(1536),
   meta JSONB
);

CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON chunks (document_id);
CREATE INDEX ON chunks USING gin(meta);
```

## Retrieval Flow
1. Embed query → 1536d vector
2. Vector search: `SELECT * FROM chunks ORDER BY embedding <=> query_vec LIMIT 20`
3. Metadata filter: `WHERE meta->>'section' = 'pricing'` if detected
4. Rerank: Cohere top-20 → top-5
5. Stuff prompt: Pass 5 chunks + query to gpt-4o-mini
6. Cite: Return [{content, document_id, page}] so UI can highlight

## Key Decisions

### Why Postgres over Pinecone?
| Feature | Postgres | Pinecone |
| --- | --- | --- |
| Cost 100k vectors | $15/mo RDS | $70/mo |
| Joins | JOIN users WHERE team_id = x | Ship IDs back, N+1 |
| Filtering | WHERE meta->>'type' = 'pdf' indexed | Metadata filters cost extra |

**Tradeoff**: Pinecone faster at >10M vectors. We migrate if we hit 5M.

### Why 800 chunk size?
Tested 256, 512, 800, 1200 on our docs. 800 had best recall @ top-5. 256 broke semantic units. 1200 exceeded gpt-4o-mini context with 5 chunks.

### Why LangGraph not raw chains?
Need loops: if reranker confidence <0.7, do hyde retrieval. Chains can't branch.

## Bottlenecks & Scaling
| Issue | Symptom | Fix |
| --- | --- | --- |
| Slow index build | ivfflat creation takes 10min | Create index after bulk insert. Use lists = sqrt(rows) |
| Cold query | First query 800ms | Warm: `SELECT * FROM chunks ORDER BY embedding LIMIT 1` on deploy |
| Cost spike | Embeddings $200/mo | Cache queries + batch embed docs in Celery |
| Bad recall | User: "not in docs" | Add HyDE: generate hypothetical answer, embed that |

## Lessons Learned
- **Don't chunk by char**: Split by `##` headers first, then recursive. Keeps context.
- **Store raw + cleaned text**: Need raw for citations, cleaned for embedding
- **IVFFlat needs >10k rows**: Use hnsw if <10k chunks or queries are <50ms
- **Rerank is worth it**: +18% accuracy on our eval set. Cheaper than larger context.

## Setup Commands
```bash
# 1. DB
docker run -d -p 5432:5432 ankane/pgvector

# 2. Ingest
python scripts/ingest.py --file docs.pdf --user-id uuid

# 3. Query
curl localhost:8000/chat -d '{"query": "pricing"}'
```

## Reuse Checklist
When starting new RAG project:
- [ ] Copy schemas.sql
- [ ] Copy ingest.py and change chunk_size
- [ ] Copy retriever.py and update rerank model
- [ ] Run eval: /scripts/eval_rag.py on 20 Q&A pairs
- [ ] Log deviations in new project's DECISIONS.md

## Related Files in This Repo
- `snippets/python/pgvector_setup.py` — Index creation
- `snippets/python/langgraph_rag.py` — Full LangGraph flow
- `memory/scaling-issues/pgvector-ivfflat-tuning.md` — How we picked lists=100
