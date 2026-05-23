"""
LangGraph RAG pipeline for Django + pgvector
Copy to: backend/rag/graph.py

Deps: pip install langgraph langchain-openai langchain-cohere psycopg2-binary

Usage:
    from snippets.django.langgraph_rag import rag_chain
    result = rag_chain.invoke({"question": "What is pricing?"})
    print(result["answer"], result["sources"])
"""

import os
from typing import List, TypedDict

from django.db import connection

from langchain_core.documents import Document
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_cohere import CohereRerank
from langgraph.graph import StateGraph, END
from pgvector.django import CosineDistance

from .rag_models import Chunk

EMBED_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"
RERANK_MODEL = "rerank-english-v3.0"
TOP_K_RETRIEVE = 20
TOP_K_RERANK = 5

embeddings = OpenAIEmbeddings(model=EMBED_MODEL)
llm = ChatOpenAI(model=CHAT_MODEL, temperature=0)
reranker = CohereRerank(model=RERANK_MODEL, top_n=TOP_K_RERANK)


class RAGState(TypedDict):
    question: str
    query_embedding: List[float]
    retrieved_docs: List[Document]
    reranked_docs: List[Document]
    answer: str
    sources: List[dict]


def embed_query(state: RAGState) -> RAGState:
    vec = embeddings.embed_query(state["question"])
    return {"query_embedding": vec}


def retrieve(state: RAGState) -> RAGState:
    chunks = (
        Chunk.objects
        .annotate(distance=CosineDistance("embedding", state["query_embedding"]))
        .order_by("distance")[:TOP_K_RETRIEVE]
        .select_related("document")
    )

    docs = [
        Document(
            page_content=c.content,
            metadata={
                "chunk_id": str(c.id),
                "document_id": str(c.document_id),
                "filename": c.document.filename,
                "distance": float(c.distance),
                **c.meta,
            }
        )
        for c in chunks
    ]
    return {"retrieved_docs": docs}


def rerank(state: RAGState) -> RAGState:
    if not state["retrieved_docs"]:
        return {"reranked_docs": []}
    docs = reranker.compress_documents(
        documents=state["retrieved_docs"],
        query=state["question"]
    )
    return {"reranked_docs": docs}


def generate(state: RAGState) -> RAGState:
    if not state["reranked_docs"]:
        return {"answer": "No relevant information found in the documents.", "sources": []}

    context = "\n\n".join(
        f"Source [{i}]: {doc.metadata['filename']} - {doc.metadata.get('page', 'N/A')}\n{doc.page_content}"
        for i, doc in enumerate(state["reranked_docs"])
    )

    prompt = f"""Answer the question based only on the sources below. Cite sources as [0], [1], etc. If the answer isn't in the sources, say you don't know.

Question: {state['question']}

Sources:
{context}

Answer:"""

    response = llm.invoke(prompt)
    sources = [
        {
            "index": i,
            "filename": doc.metadata["filename"],
            "chunk_id": doc.metadata["chunk_id"],
            "page": doc.metadata.get("page"),
        }
        for i, doc in enumerate(state["reranked_docs"])
    ]
    return {"answer": response.content, "sources": sources}


workflow = StateGraph(RAGState)
workflow.add_node("embed", embed_query)
workflow.add_node("retrieve", retrieve)
workflow.add_node("rerank", rerank)
workflow.add_node("generate", generate)

workflow.set_entry_point("embed")
workflow.add_edge("embed", "retrieve")
workflow.add_edge("retrieve", "rerank")
workflow.add_edge("rerank", "generate")
workflow.add_edge("generate", END)

rag_chain = workflow.compile()


def ingest_document(user_id, filename: str, text: str, meta: dict = None):
    """Split, embed, and store a document."""
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from .rag_models import Document as DocModel, Chunk

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks = splitter.split_text(text)

    doc = DocModel.objects.create(user_id=user_id, filename=filename, s3_path="")
    vectors = embeddings.embed_documents(chunks)

    Chunk.objects.bulk_create([
        Chunk(
            document=doc,
            content=chunk,
            embedding=vec,
            meta={**(meta or {}), "chunk_index": i}
        )
        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
    ])
    return doc.id
