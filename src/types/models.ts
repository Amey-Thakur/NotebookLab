/*
 * Name: models.ts
 * Purpose: Shared type definitions mirroring Rust backend models.
 * Description: These types must match the Rust structs exactly. Changes to
 *   Rust models should be reflected here.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
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

export interface RecentNote extends Note {
  notebook_name: string;
}

export interface RecentDocument extends Document {
  notebook_name: string;
}

export interface GraphNode {
  id: string;
  title: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface NotesGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
  /** Provider family: "sidecar" | "ollama" | "openai" | "anthropic" |
      "gemini" | "deepseek" | "lmstudio" | "llamacpp" | "custom". */
  kind: string;
  model: string;
  is_local: boolean;
  is_available: boolean;
  is_active: boolean;
}

/** A saved provider configuration; never carries the API key itself. */
export interface SavedProviderInfo {
  name: string;
  kind: string;
  base_url: string;
  model: string;
  is_local: boolean;
  has_api_key: boolean;
}

export interface OllamaStatus {
  running: boolean;
  installed: boolean;
  version: string | null;
}

export interface OllamaModel {
  name: string;
  size_bytes: number;
  parameter_size: string | null;
  quantization: string | null;
  family: string | null;
}

export interface OllamaPullProgress {
  model: string;
  status: string;
  total: number;
  completed: number;
  percent: number;
  done: boolean;
}

export interface OllamaPullFinished {
  model: string;
  ok: boolean;
  error: string | null;
}

/** The last completed AI request, with token counts as reported by the
    provider itself. */
export interface LastRequest {
  provider: string;
  kind: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  context_window: number | null;
  at_epoch_ms: number;
  auto_selected: boolean;
}

export interface ModelUsage {
  provider: string;
  kind: string;
  model: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface UsageStats {
  auto_enabled: boolean;
  last: LastRequest | null;
  models: ModelUsage[];
}

export interface HardwareProfile {
  total_ram_gb: number;
  cpu_name: string;
  cpu_cores: number;
  gpu_name: string | null;
  gpu_vram_gb: number | null;
}
