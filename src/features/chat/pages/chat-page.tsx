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
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { JobProgress } from "@/components/shared/job-progress";
import { useRetainedState } from "@/lib/use-persistent-draft";
import { useJobRun } from "@/features/jobs/use-job-run";
import { DownloadButton } from "@/components/shared/download-button";
import { downloadText, toFileName } from "@/lib/download";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";
import { useDropImport } from "@/features/documents/hooks/use-drop-import";
import { ModelRequiredNotice } from "@/components/shared/model-required-notice";
import { CitationList } from "../components/citation-list";
import type { Conversation, Message, Document } from "@/types/models";


/** Render a conversation as Markdown.
 *
 *  A chat that cannot leave the app is a chat you have to keep the app open
 *  to read. The roles become headings so the file is still legible as a
 *  document rather than a wall of alternating paragraphs. */
function toTranscript(title: string, messages: Message[]): string {
  const blocks = messages.map(
    (m) => `## ${m.role === "user" ? "You" : "NotebookLab"}\n\n${m.content}`,
  );
  return `# ${title}\n\n${blocks.join("\n\n")}\n`;
}

export function ChatPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const queryClient = useQueryClient();
  /* Selection is derived, not stored, so returning to Chat reopens the most
     recent thread without a state-sync effect. "auto" (null) shows the newest
     conversation; "new" shows a blank one; a string pins an explicit choice. */
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Drop a file onto chat to add it to this notebook as a source. The existing
     import pipeline indexes it (images via OCR); the next question can use it. */
  const { isDragging, isImporting, importError, attach } = useDropImport(activeNotebookId ?? undefined);
  const [justAdded, setJustAdded] = useState(false);
  const wasImporting = useRef(false);

  const { data: conversations } = useQuery({
    queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId],
    queryFn: () => tauriInvoke<Conversation[]>("list_conversations", { notebook_id: activeNotebookId }),
    enabled: !!activeNotebookId,
  });

  /* The conversation actually shown: an explicit pick, a blank new chat, or
     (default) the most recent thread for this notebook. Deriving it here means
     navigating away and back reopens the last chat with no effect needed. */
  const conversationId =
    selected === "new" ? null : (selected ?? conversations?.[0]?.id ?? null);

  const { data: messages } = useQuery({
    queryKey: [QUERY_KEYS.CHAT, conversationId],
    queryFn: () => tauriInvoke<Message[]>("get_chat_messages", { conversation_id: conversationId }),
    enabled: !!conversationId,
    refetchInterval: false,
  });

  /* Scope: which notebook and how many sources answers are drawn from. */
  const { data: notebooks } = useNotebooks();
  const activeNotebook = notebooks?.find((nb) => nb.id === activeNotebookId);
  const { data: documents } = useQuery({
    queryKey: [QUERY_KEYS.DOCUMENTS, activeNotebookId],
    queryFn: () => tauriInvoke<Document[]>("list_documents", { notebook_id: activeNotebookId }),
    enabled: !!activeNotebookId,
  });
  const docCount = documents?.length ?? 0;

  const startChat = useMutation({
    mutationFn: () =>
      tauriInvoke<string>("start_chat", { notebook_id: activeNotebookId }),
    onSuccess: (id) => {
      setSelected(id);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
    },
  });

  /* The answer as it is being written. The backend emits it while the model
     works, so a long reply shows itself arriving instead of the user watching a
     bar for minutes with nothing to read. */
  const [streaming, setStreaming] = useState<{ conversationId: string; content: string } | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/event")
      .then(async ({ listen }) => {
        const stop = await listen<{ conversation_id: string; content: string }>(
          "chat-partial",
          (event) =>
            setStreaming({
              conversationId: event.payload.conversation_id,
              content: event.payload.content,
            }),
        );
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* No event bridge: the answer still arrives, just all at once. */
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  /* The reply is a tracked job, so it keeps going when the user leaves Chat and
     is still there, finished or in progress, when they come back. */
  const send = useJobRun("send_chat_message", "notebooklab-job-chat");

  /* Pull the finished answer into view. The message itself was written to the
     database by the backend, so this only has to invalidate; the content in the
     job result is not the source of truth. */
  useEffect(() => {
    if (!send.job || send.job.status !== "done") return;
    /* The partial needs no clearing here: it is only rendered while the job is
       running, so it disappears with the bar the moment the stored message
       arrives. It is reset when the next question is asked instead. */
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHAT, conversationId] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
  }, [send.job, conversationId, activeNotebookId, queryClient]);

  /* A failure still leaves the user's question saved, so show it and hand the
     draft back for a one-keypress retry. */
  useEffect(() => {
    if (!send.error) return;
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CHAT, conversationId] });
  }, [send.error, conversationId, queryClient]);

  const deleteConversation = useMutation({
    mutationFn: (id: string) => tauriInvoke<void>("delete_conversation", { id }),
    onSuccess: (_data, id) => {
      /* Fall back to auto so the next most recent thread opens, not a blank. */
      if (id === conversationId) {
        setSelected(null);
      }
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS, activeNotebookId] });
    },
  });

  /* Hide the echo as soon as the real message is back from the database. */
  const showPendingEcho =
    !!pendingMessage &&
    !messages?.some((m) => m.role === "user" && m.content === pendingMessage);

  /* Which conversation the running job belongs to. There is one job slot for
     Chat, so without this the progress bar for a reply in one thread would also
     appear in whichever other thread the user opened next. */
  const [jobConvo, setJobConvo] = useRetainedState<string | null>(
    "notebooklab-job-chat-convo",
    null,
  );
  const jobIsForThisChat = !!send.job && jobConvo === conversationId;

  const ask = (convoId: string, message: string) => {
    /* Drop the previous answer so the last reply cannot flash under the new
       question before the first fragment of this one arrives. */
    setStreaming(null);
    setJobConvo(convoId);
    return void send.start({
      conversation_id: convoId,
      notebook_id: activeNotebookId,
      message,
    });
  };

  const handleSend = () => {
    if (!input.trim() || send.isRunning) return;
    const msg = input.trim();
    setInput("");
    setPendingMessage(msg);

    if (!conversationId) {
      startChat.mutate(undefined, {
        onSuccess: (id) => {
          setSelected(id);
          ask(id, msg);
        },
        onError: () => {
          setPendingMessage(null);
          setInput(msg);
        },
      });
    } else {
      ask(conversationId, msg);
    }
  };

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, showPendingEcho]);

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
              onClick={() => setSelected("new")}
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
                  onClick={() => setSelected(convo.id)}
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
          <p className="text-xs font-mono text-text-4 mt-1 mb-4">
            Ask about your documents, or drop a file to add one
          </p>
          <ModelRequiredNotice action="Chat" />
          {activeNotebookId && docCount === 0 && (
            <p className="mt-3 text-xs text-text-3">
              This notebook has no sources yet.{" "}
              <Link to={ROUTES.DOCUMENTS} className="font-mono text-accent hover:underline">
                Import a document
              </Link>{" "}
              or drop one here so Chat can answer from it.
            </p>
          )}
          {messages && messages.length > 0 && (
            <div className="mt-3">
              <DownloadButton
                format="Markdown"
                what="this conversation"
                onDownload={() =>
                  downloadText(
                    toTranscript(activeNotebook?.name ?? "Conversation", messages),
                    toFileName(`notebooklab-chat-${activeNotebook?.name ?? "conversation"}`, "md"),
                    "text/markdown",
                  )
                }
              />
            </div>
          )}

          {docCount > 0 && (
            <p className="mt-3 text-2xs font-mono text-text-4">
              Answering from {docCount} {docCount === 1 ? "source" : "sources"}
              {activeNotebook ? ` in ${activeNotebook.name}` : ""}.
            </p>
          )}
        </div>

        {/* Messages area: role=log announces new entries to screen readers */}
        <div role="log" aria-live="polite" className="flex-1 overflow-auto px-8 py-4">
          {(!messages || messages.length === 0) && !showPendingEcho && !send.isRunning && (
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
                    {!send.isRunning &&
                      messages[messages.length - 1]?.id === msg.id &&
                      lastUserMessage && (
                        <button
                          type="button"
                          aria-label="Ask the same question again"
                          onClick={() => {
                            setPendingMessage(lastUserMessage);
                            ask(conversationId!, lastUserMessage);
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

          {/* Optimistic echo of the message being answered.

              Derived rather than cleared on completion: the backend saves the
              user's message before it calls the model, so once the refetch
              brings it back this echo has to disappear or the question shows
              twice. Deciding that from the message list means it corrects
              itself, including after leaving Chat and returning. */}
          {showPendingEcho && (
            <div className="mb-4 p-4 max-w-[80%] ml-auto bg-surface-2 border border-border">
              <div className="text-xs font-mono text-text-4 mb-2">You</div>
              <div className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
                {pendingMessage}
              </div>
            </div>
          )}

          {/* Real phases and an estimate, not an endless "Thinking...". On a
              local model an answer can take minutes, and the pulse gave no way
              to tell working from hung. */}
          {jobIsForThisChat && send.job!.status === "running" && (
            <div className="mb-4 max-w-[80%] mr-auto">
              {/* Show the answer forming above the bar once there is anything
                  to read; the bar alone gives a number but nothing to do with
                  the wait. */}
              {streaming && streaming.conversationId === conversationId && streaming.content && (
                <div className="mb-2 p-4 bg-surface border border-border">
                  <div className="text-xs font-mono text-text-4 mb-2">NotebookLab</div>
                  <div className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
                    {streaming.content}
                    <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-accent-dim
                                     animate-pulse motion-reduce:animate-none" />
                  </div>
                </div>
              )}
              <JobProgress job={send.job!} onCancel={send.cancel} compact />
            </div>
          )}

          {send.error && (
            <div role="alert" className="mb-4 p-3 border border-error text-xs text-error">
              {send.error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area: stays enabled while pending so focus is never dropped */}
        <div className="px-8 py-4 border-t border-border">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={attach}
              disabled={isImporting}
              title="Add a file to this notebook"
              aria-label="Add a file"
              className="px-3 py-3 border border-border text-text-3 hover:text-text-1
                         hover:border-accent-dim disabled:opacity-50 transition-colors"
            >
              {isImporting ? (
                <span className="text-xs font-mono">...</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
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
              disabled={send.isRunning || !input.trim()}
              className="px-4 py-3 text-sm font-mono bg-primary text-on-primary disabled:opacity-50
                         hover:bg-primary-hover transition-colors"
            >
              {send.isRunning ? "Waiting..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
