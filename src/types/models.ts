/*
 * Title: models.ts
 * Tech Stack: TypeScript
 * Description: Shared type definitions mirroring Rust backend models.
 * Important Details: These types must match the Rust structs exactly.
 *   Changes to Rust models should be reflected here.
 */

export interface Notebook {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  notebook_id: string;
  title: string;
  file_path: string;
  file_type: string;
  file_hash: string;
  file_size: number;
  status: "pending" | "processing" | "processed" | "error";
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  position: number;
  page_number: number | null;
  heading_context: string;
  token_count: number;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  notebook_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  content: string;
  heading_context: string;
  page_number: number | null;
  score: number;
}

export interface CitationSource {
  chunk_id: string;
  document_id: string;
  document_title: string;
  heading_context: string;
  page_number: number | null;
  snippet: string;
  relevance_score: number;
}

export interface SidecarStatus {
  state: "stopped" | "starting" | "ready" | "crashed" | "stopping";
  port: number;
  model_path: string;
  pid: number;
}

export interface ModelFileInfo {
  name: string;
  size_bytes: number;
  size_display: string;
}

export interface UnifiedSearchResult {
  chunks: SearchResult[];
  notes: Note[];
}

export interface ChatResponse {
  message_id: string;
  content: string;
}

export interface ProviderInfo {
  index: number;
  name: string;
  is_local: boolean;
  is_available: boolean;
  is_active: boolean;
}
