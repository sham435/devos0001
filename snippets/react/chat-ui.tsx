import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { filename: string; page?: number }[];
}

interface RAGChatProps {
  wsUrl: string;
  placeholder?: string;
}

export function RAGChat({ wsUrl, placeholder = 'Ask about your documents...' }: RAGChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'chunk') {
          setStreaming((prev) => prev + data.content);
        } else if (data.type === 'sources') {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: streaming, sources: data.content },
          ]);
          setStreaming('');
          setLoading(false);
        } else if (data.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: `Error: ${data.content}` },
          ]);
          setLoading(false);
        } else if (data.type === 'done') {
          setLoading(false);
        }
      };

      ws.current.onclose = () => {
        setTimeout(connect, 3000);
      };
    };

    connect();
    return () => ws.current?.close();
  }, [wsUrl]);

  // Capture streaming into messages on done
  useEffect(() => {
    if (!loading && streaming) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: streaming },
      ]);
      setStreaming('');
    }
  }, [loading]);

  const send = () => {
    if (!input.trim() || loading) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: input }]);
    ws.current?.send(JSON.stringify({ question: input }));
    setInput('');
    setLoading(true);
  };

  return (
    <div className="flex flex-col h-[600px] max-w-2xl mx-auto border rounded-lg">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
              msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 text-xs opacity-70">
                  {msg.sources.map((s, i) => (
                    <span key={i} className="mr-2">
                      {s.filename}{s.page ? `:${s.page}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-100">
              <p className="whitespace-pre-wrap">{streaming}<span className="animate-pulse">|</span></p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-4 flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={placeholder}
          disabled={loading}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          onClick={send}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
