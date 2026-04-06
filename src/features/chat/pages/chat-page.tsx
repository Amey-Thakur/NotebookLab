/*
 * Title: chat-page.tsx
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * Description: RAG-powered chat page. Users ask questions about their documents
 *   and receive cited answers from the LLM provider.
 * Important Details: Requires an active notebook and a registered provider.
 *   Shows clear error states when either is missing. Messages are persisted
 *   via Tauri IPC and the conversation is scoped to the active notebook.
 */

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";


interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ChatResponse {
  message_id: string;
  content: string;
}


export function ChatPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: [QUERY_KEYS.CHAT, conversationId],
    queryFn: () => tauriInvoke<Message[]>("get_chat_messages", { conversation_id: conversationId }),
    enabled: !!conversationId,
    refetchInterval: false,
  });

  const startChat = useMutation({
    mutationFn: () =>
      tauriInvoke<string>("start_chat", { notebook_id: activeNotebookId }),
    onSuccess: (id) => setConversationId(id),
  });

  /* Accept explicit convoId to avoid stale closure when starting a new conversation */
  const sendMessage = useMutation({
    mutationFn: ({ convoId, message }: { convoId: string; message: string }) =>
      tauriInvoke<ChatResponse>("send_chat_message", {
        conversation_id: convoId,
        notebook_id: activeNotebookId,
        message,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHAT, variables.convoId] });
    },
  });

  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;
    const msg = input.trim();
    setInput("");

    if (!conversationId) {
      startChat.mutate(undefined, {
        onSuccess: (id) => {
          setConversationId(id);
          sendMessage.mutate({ convoId: id, message: msg });
        },
      });
    } else {
      sendMessage.mutate({ convoId: conversationId, message: msg });
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4">Open a notebook first to chat with your documents.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-3">
        <h1 className="text-2xl font-display font-bold text-text-1">Chat</h1>
        <p className="text-xs font-mono text-text-4 mt-1">Ask questions about your documents</p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {(!messages || messages.length === 0) && !sendMessage.isPending && (
          <div className="flex items-center justify-center h-full text-text-4">
            <p className="text-sm">Start a conversation by asking a question below.</p>
          </div>
        )}

        {messages?.map((msg) => (
          <div
            key={msg.id}
            className={`mb-4 p-4 max-w-[80%] ${
              msg.role === "user"
                ? "ml-auto bg-surface-2 border border-border"
                : "mr-auto bg-surface border border-border"
            }`}
          >
            <div className="text-xs font-mono text-text-4 mb-2">
              {msg.role === "user" ? "You" : "NotebookLab"}
            </div>
            <div className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </div>
          </div>
        ))}

        {sendMessage.isPending && (
          <div className="mb-4 p-4 max-w-[80%] mr-auto bg-surface border border-border">
            <div className="text-xs font-mono text-text-4 mb-2">NotebookLab</div>
            <div className="text-sm text-text-3 animate-pulse">Thinking...</div>
          </div>
        )}

        {sendMessage.isError && (
          <div className="mb-4 p-3 border border-error text-xs text-error">
            {String(sendMessage.error)}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-8 py-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your documents..."
            className="flex-1 px-4 py-3 text-sm bg-surface border border-border text-text-1
                       placeholder:text-text-4 outline-none focus:border-accent-dim"
            disabled={sendMessage.isPending}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sendMessage.isPending || !input.trim()}
            className="px-4 py-3 text-sm font-mono bg-accent-dim text-text-1 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
