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
pub mod first_run_service;
pub mod ingestion_service;
pub mod rag_service;
pub mod search_service;

/* thinking_service and transform_service logic moved into commands
   for proper lock-phase splitting. Service files kept for reference
   but re-exported types only. */
pub mod transform_service;
