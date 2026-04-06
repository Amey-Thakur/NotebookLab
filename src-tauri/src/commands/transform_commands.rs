/*
 * Title: transform_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for content transformations (summarize, extract, custom).
 * Important Details: Transformations operate on a single document. The transform_type
 *   field determines the behavior (summarize, extract_key_points, or custom with a
 *   user-provided prompt).
 */

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::transform_service::{self, TransformType};
use crate::state::AppState;


#[tauri::command]
pub fn transform_document(
    state: State<'_, AppState>,
    document_id: String,
    transform_type: TransformType,
    custom_prompt: Option<String>,
) -> AppResult<String> {
    if document_id.trim().is_empty() {
        return Err(AppError::InvalidInput("Document ID is required".into()));
    }

    let conn = state.conn()?;
    let providers = state.providers.lock()
        .map_err(|_| AppError::Internal("Provider lock poisoned".into()))?;

    transform_service::transform_document(
        &conn,
        &providers,
        &document_id,
        transform_type,
        custom_prompt.as_deref(),
    )
}
