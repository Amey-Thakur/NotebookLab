/*
 * Title: transform_service.rs
 * Tech Stack: Rust, serde
 * Description: Content transformation types. The actual transformation logic lives
 *   in transform_commands.rs for proper lock-phase splitting.
 * Important Details: TransformType determines which prompt instruction is used.
 *   Custom transforms accept a user-provided prompt string.
 */


#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransformType {
    Summarize,
    ExtractKeyPoints,
    Custom,
}

impl TransformType {
    pub fn instruction(&self, custom_prompt: Option<&str>) -> String {
        match self {
            Self::Summarize => "Transformation: SUMMARIZE".to_string(),
            Self::ExtractKeyPoints => "Transformation: EXTRACT_KEY_POINTS".to_string(),
            Self::Custom => {
                let prompt = custom_prompt.unwrap_or("Analyze this text.");
                format!("Transformation: CUSTOM\nUser instruction: {prompt}")
            }
        }
    }
}
