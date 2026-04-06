/*
 * Title: document.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Document domain model. Represents an ingested file (PDF, DOCX, TXT, MD)
 *   within a notebook, along with its processing status.
 * Important Details: The status field tracks the ingestion pipeline state. Documents
 *   transition: pending -> processing -> processed | error. The file_hash column
 *   enables deduplication detection across notebooks.
 */

use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_hash: String,
    pub file_size: i64,
    pub status: DocumentStatus,
    pub created_at: String,
    pub updated_at: String,
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentStatus {
    Pending,
    Processing,
    Processed,
    Error,
}

impl DocumentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Processing => "processing",
            Self::Processed => "processed",
            Self::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "pending" => Self::Pending,
            "processing" => Self::Processing,
            "processed" => Self::Processed,
            "error" => Self::Error,
            other => {
                tracing::warn!("Unknown document status: {other}, defaulting to Pending");
                Self::Pending
            }
        }
    }
}


#[derive(Debug, Deserialize)]
pub struct CreateDocument {
    pub notebook_id: String,
    pub title: String,
    pub file_path: String,
    pub file_type: String,
    pub file_hash: String,
    pub file_size: i64,
}
