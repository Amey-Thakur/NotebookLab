/*
 * Name: mod.rs
 * Purpose: Business logic layer.
 * Description: Services orchestrate repositories, providers, and parsers to
 *   implement application features. Services are stateless.
 *   Dependencies are passed as parameters. Each service file
 *   handles one domain.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod auto_setup_service;
pub mod chunking_service;
pub mod embedding_service;
pub mod first_run_service;
pub mod ingestion_service;
pub mod job_service;
pub mod ollama_service;
pub mod provider_config_service;
pub mod rag_service;
pub mod search_service;
pub mod sidecar_service;
/* transform_service holds the TransformType enum and its prompt mapping;
the orchestration lives in transform_commands for lock-phase splitting. */
pub mod transform_service;
