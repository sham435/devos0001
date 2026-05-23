# Engineering Decisions

## Why Redis over RabbitMQ?
Need sub-10ms pub/sub for real-time chat. RabbitMQ adds broker latency. Redis fits single-region scale. Will migrate if we go multi-region.

## Why LangGraph instead of CrewAI?
Need explicit state machines for agent loops. CrewAI abstracts too much. Debugging agent traces in LangGraph is cleaner with LangSmith.

## Why Postgres + pgvector vs Pinecone?
Data locality + cost. Keeping embeddings with relational data simplifies joins. Will move to Pinecone if we exceed 10M vectors.
