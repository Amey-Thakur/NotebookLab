/*
 * Name: chat-page.tsx
 * Purpose: RAG-powered chat page.
 * Description: Users ask questions about their documents and receive answers
 *   grounded in cited sources. The user message renders
 *   optimistically so it stays visible through the 30-120s LLM
 *   wait; on failure the draft returns to the input for retry.
 *   Past conversations are listed in a side rail and can be
 *   resumed or deleted. The message list is an aria-live log so
 *   screen readers hear new answers, and the input stays enabled
 *   while a reply is pending so keyboard focus is never dropped.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { useNotebookStore } from "@/stores/notebook-store";
import { useDropImport } from "@/features/documents/hooks/use-drop-import";
import { CitationList } from "../components/citation-list";
import type { Conversation, Message, ChatResponse } from "@/types/models";


export function ChatPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Drop a file onto chat to add it to this notebook as a source. The existing
     import pipeline indexes it (images via OCR); the next question can use it. */
  const { isDragging, isImporting, importError } = useDropImport(activeNotebookId ?? undefined);
  const [justAdded, setJustAdded] = useState(false);
  const wasImporting = useRef(false);

  const { data: conversations } = useQuery({
    queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId],
    queryFn: () => tauriInvoke<Conversation[]>("list_conversations", { notebook_id: activeNotebookId }),
    enabled: !!activeNotebookId,
  });

  const { data: messages } = useQuery({
    queryKey: [QUERY_KEYS.CHAT, conversationId],
    queryFn: () => tauriInvoke<Message[]>("get_chat_messages", { conversation_id: conversationId }),
    enabled: !!conversationId,
    refetchInterval: false,
  });

  const startChat = useMutation({
    mutationFn: () =>
      tauriInvoke<string>("start_chat", { notebook_id: activeNotebookId }),
    onSuccess: (id) => {
      setConversationId(id);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
    },
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
      setPendingMessage(null);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHAT, variables.convoId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
    },
    onError: (_error, variables) => {
      /* The backend already stored the user message; refresh so it shows,
         and hand the draft back so retrying is one keypress away. */
      setPendingMessage(null);
      setInput(variables.message);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHAT, variables.convoId] });
      inputRef.current?.focus();
    },
  });

  const deleteConversation = useMutation({
    mutationFn: (id: string) => tauriInvoke<void>("delete_conversation", { id }),
    onSuccess: (_data, id) => {
      if (id === conversationId) {
        setConversationId(null);
      }
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
    },
  });

  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;
    const msg = input.trim();
    setInput("");
    setPendingMessage(msg);

    if (!conversationId) {
      startChat.mutate(undefined, {
        onSuccess: (id) => {
          setConversationId(id);
          sendMessage.mutate({ convoId: id, message: msg });
        },
        onError: () => {
          setPendingMessage(null);
          setInput(msg);
        },
      });
    } else {
      sendMessage.mutate({ convoId: conversationId, message: msg });
    }
  };

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, pendingMessage]);

  /* Confirm a dropped import once it settles cleanly. */
  useEffect(() => {
    const was = wasImporting.current;
    wasImporting.current = isImporting;
    if (was && !isImporting && !importError) {
      setJustAdded(true);
      const timer = setTimeout(() => setJustAdded(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isImporting, importError]);

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4 mb-4">Open a notebook first to chat with your documents.</p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  const hasHistory = conversations && conversations.length > 0;
  const lastUserMessage = messages
    ? ([...messages].reverse().find((m) => m.role === "user")?.content ?? null)
    : null;

  return (
    <div className="relative flex h-full">
      {/* Drop a file anywhere on chat to import it into this notebook */}
      {isDragging && (
        <div
          className="absolute inset-4 z-20 flex items-center justify-center border-2 border-dashed
                     border-accent bg-surface/90 pointer-events-none"
        >
          <p className="text-sm font-mono text-accent">Drop a file to add it to this notebook</p>
        </div>
      )}

      {/* Import feedback: adding, added, or failed */}
      {(isImporting || justAdded || importError) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-8">
          <span
            role="status"
            className={cn(
              "rounded-sm border bg-surface px-3 py-1.5 text-xs font-mono",
              importError
                ? "border-error text-error"
                : justAdded
                  ? "border-accent-dim text-mark"
                  : "border-accent-dim text-accent animate-pulse motion-reduce:animate-none",
            )}
          >
            {importError
              ? formatError(importError)
              : justAdded
                ? "Added to this notebook. Ask about it below."
                : "Adding to this notebook…"}
          </span>
        </div>
      )}

      {/* Conversation history rail */}
      {hasHistory && (
        <nav aria-label="Past conversations" className="w-56 shrink-0 border-r border-border overflow-y-auto py-4">
          <div className="px-4 mb-3 flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest uppercase text-text-4">History</span>
            <button
              type="button"
              onClick={() => setConversationId(null)}
              className="text-xs font-mono text-text-3 hover:text-text-1 transition-colors"
            >
              + New
            </button>
          </div>
          <ul>
            {conversations.map((convo) => (
              <li key={convo.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setConversationId(convo.id)}
                  aria-current={convo.id === conversationId ? "true" : undefined}
                  className={`flex-1 text-left px-4 py-2 text-xs truncate transition-colors ${
                    convo.id === conversationId
                      ? "text-text-1 bg-surface-2"
                      : "text-text-3 hover:text-text-2 hover:bg-surface-2"
                  }`}
                >
                  {convo.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteConversation.mutate(convo.id)}
                  aria-label={`Delete conversation ${convo.title}`}
                  className="px-2 py-2 text-xs text-text-4 opacity-0 group-hover:opacity-100
                             focus-visible:opacity-100 hover:text-error transition-opacity"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="px-8 pt-6 pb-3">
          <h1 className="text-2xl font-display font-bold text-text-1">Chat</h1>
          <p className="text-xs font-mono text-text-4 mt-1">
            Ask about your documents, or drop a file to add one
          </p>
        </div>

        {/* Messages area: role=log announces new entries to screen readers */}
        <div role="log" aria-live="polite" className="flex-1 overflow-auto px-8 py-4">
          {(!messages || messages.length === 0) && !pendingMessage && !sendMessage.isPending && (
            <div className="flex items-center justify-center h-full text-text-4">
              <p className="text-sm">Start a conversation by asking a question below.</p>
            </div>
          )}

          {messages?.map((msg) => (
            <div
              key={msg.id}
              className={`group mb-4 p-4 max-w-[80%] ${
                msg.role === "user"
                  ? "ml-auto bg-surface-2 border border-border"
                  : "mr-auto bg-surface border border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-text-4">
                  {msg.role === "user" ? "You" : "NotebookLab"}
                </span>
                {msg.role === "assistant" && (
                  <span className="flex items-center gap-3">
                    {/* Ask the same question again, on the last answer only */}
                    {!sendMessage.isPending &&
                      messages[messages.length - 1]?.id === msg.id &&
                      lastUserMessage && (
                        <button
                          type="button"
                          aria-label="Ask the same question again"
                          onClick={() => {
                            setPendingMessage(lastUserMessage);
                            sendMessage.mutate({ convoId: conversationId!, message: lastUserMessage });
                          }}
                          className="text-2xs font-mono text-text-4 opacity-0 group-hover:opacity-100
                                     focus-visible:opacity-100 hover:text-text-1 transition-opacity"
                        >
                          Regenerate
                        </button>
                      )}
                    <button
                      type="button"
                      aria-label="Copy answer"
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content).then(
                          () => {
                            setCopiedMessageId(msg.id);
                            setTimeout(() => setCopiedMessageId(null), 1500);
                          },
                          () => setCopiedMessageId(null),
                        );
                      }}
                      className="text-2xs font-mono text-text-4 opacity-0 group-hover:opacity-100
                                 focus-visible:opacity-100 hover:text-text-1 transition-opacity"
                    >
                      {copiedMessageId === msg.id ? "Copied" : "Copy"}
                    </button>
                  </span>
                )}
              </div>
              <div className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>
              {msg.role === "assistant" && <CitationList messageId={msg.id} />}
            </div>
          ))}

          {/* Optimistic echo of the message being answered */}
          {pendingMessage && (
            <div className="mb-4 p-4 max-w-[80%] ml-auto bg-surface-2 border border-border">
              <div className="text-xs font-mono text-text-4 mb-2">You</div>
              <div className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
                {pendingMessage}
              </div>
            </div>
          )}

          {sendMessage.isPending && (
            <div className="mb-4 p-4 max-w-[80%] mr-auto bg-surface border border-border">
              <div className="text-xs font-mono text-text-4 mb-2">NotebookLab</div>
              <div className="text-sm text-text-3 animate-pulse motion-reduce:animate-none">Thinking...</div>
            </div>
          )}

          {sendMessage.isError && (
            <div role="alert" className="mb-4 p-3 border border-error text-xs text-error">
              {formatError(sendMessage.error)}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area: stays enabled while pending so focus is never dropped */}
        <div className="px-8 py-4 border-t border-border">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about your documents..."
              aria-label="Ask about your documents"
              className="flex-1 px-4 py-3 text-sm bg-surface border border-border text-text-1
                         placeholder:text-text-4 outline-none focus:border-accent-dim"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sendMessage.isPending || !input.trim()}
              className="px-4 py-3 text-sm font-mono bg-primary text-on-primary disabled:opacity-50
                         hover:bg-primary-hover transition-colors"
            >
              {sendMessage.isPending ? "Waiting..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
