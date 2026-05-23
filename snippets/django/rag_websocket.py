"""
WebSocket handler for streaming RAG responses.
Copy to: backend/rag/consumers.py

Setup:
1. Add to routing: path("ws/chat/", RAGChatConsumer.as_asgi())
2. Update CHANNEL_LAYERS in settings

Usage:
  ws.send(json.dumps({"question": "What is pricing?"}))
  # Receives: {"type": "chunk", "content": "..."}
  # Receives: {"type": "sources", "content": [...]}
  # Receives: {"type": "done"}
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async

from .langgraph_rag import rag_chain


class RAGChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return
        await self.accept()

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        data = json.loads(text_data)
        question = data.get("question", "")
        if not question:
            await self.send(json.dumps({"type": "error", "content": "No question provided"}))
            return

        result = await database_sync_to_async(rag_chain.invoke)({"question": question})

        # Stream answer in chunks
        answer = result["answer"]
        chunk_size = 20
        for i in range(0, len(answer), chunk_size):
            await self.send(json.dumps({
                "type": "chunk",
                "content": answer[i:i + chunk_size]
            }))

        await self.send(json.dumps({
            "type": "sources",
            "content": result["sources"]
        }))

        await self.send(json.dumps({"type": "done"}))
