# pgvector IVFFlat Tuning — Why `lists = sqrt(rows)`

**Date Discovered**: 2026-05-23
**System**: RAG v1, Postgres 16 + pgvector 0.7.0
**Symptom**: Slow queries at 100k chunks

## Problem
Initial ivfflat index with default `lists=100`. At 100k chunks:
- **Query latency**: 180ms p95
- **Recall@5**: 0.91 vs 0.97 with no index
- **Build time**: 45s

## Benchmark: `lists` vs latency/recall on 100k chunks, 1536d
| lists | Build time | Query p95 | Recall@5 | Notes |
| --- | --- | --- | --- | --- |
| 10 | 8s | 45ms | 0.84 | Too few partitions |
| 100 | 45s | 180ms | 0.91 | Default. Too many rows per list |
| 316 | 92s | 28ms | 0.96 | `sqrt(100k)`. Sweet spot |
| 1000 | 340s | 18ms | 0.94 | Diminishing returns |
| 3162 | 1200s | 15ms | 0.92 | Too many lists, overhead > benefit |

**Hardware**: RDS db.t4g.medium, 2 vCPU, 4GB RAM

## Why `sqrt(rows)` works
IVFFlat partitions vectors into `lists` clusters via k-means. Query:
1. Find nearest `probes` clusters (default `probes=1`)
2. Linear scan vectors in those clusters

Cost ≈ `L + N/L`. Minimize → `L = sqrt(N)`

## Decision
**Rule**: `lists = int(sqrt(row_count))` with floor 100, cap 2000.

```python
def calc_lists(row_count):
    return max(100, min(2000, int(row_count ** 0.5)))
```

## When to Rebuild
- After bulk ingest >10% of total rows
- Nightly if row count grew >5% that day
- Manual: `python snippets/django/pgvector_setup.py index <new_lists>`

## Gotchas
- Must `ANALYZE rag_chunk` after index or planner picks seq scan
- `CONCURRENTLY` required in prod — locks table 2-20min otherwise
- RAM: Index ≈ 4 * dims * rows / lists. 100k rows, 316 lists ≈ 2MB. Negligible.

## Migration Path
| Rows | Index | lists | Query p95 |
| --- | --- | --- | --- |
| <10k | HNSW | m=16 | <10ms |
| 10k-5M | IVFFlat | sqrt(rows) | 20-50ms |
| >5M | IVFFlat + probes=10 or Pinecone | 2000 | 50-100ms |

## Links
- `architectures/rag/rag-system-v1.md` — Bottlenecks section
- `snippets/django/pgvector_setup.py` — Index creation
- `snippets/django/celery_ingest_task.py` — Auto-reindex

**Time saved if forgotten**: 3hrs re-benchmarking + wrong choice costs $200/mo in latency
