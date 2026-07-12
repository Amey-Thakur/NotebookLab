/*
 * Title: services/mod.rs
 * Tech Stack: Rust
 * Description: Business logic layer. Services orchestrate repositories, providers,
 *   and parsers to implement application features.
 * Important Details: Services are stateless. Dependencies are passed as parameters.
 *   Each service file handles one domain.
 */

pub mod auto_setup_service;
pub mod chunking_service;
pub mod embedding_service;
pub mod first_run_service;
pub mod ingestion_service;
pub mod rag_service;
pub mod search_service;
pub mod sidecar_service;
/* transform_service holds the TransformType enum and its prompt mapping;
the orchestration lives in transform_commands for lock-phase splitting. */
pub mod transform_service;
