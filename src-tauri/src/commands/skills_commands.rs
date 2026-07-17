/*
 * Name: skills_commands.rs
 * Purpose: Load the AI-SKILLS library (github.com/Amey-Thakur/AI-SKILLS) into
 *   the app.
 * Description: Fetches the library's machine-readable catalog so Prompt
 *   Studio can offer proven working methods without the user hunting for
 *   them. Strictly scoped: only the fixed AI-SKILLS repository is ever
 *   contacted (both the catalog and skill bodies are validated against that
 *   prefix), the catalog is cached in settings for a day so offline sessions
 *   and repeat visits cost nothing, and a fetch failure degrades to the
 *   cached copy or an empty list, never an error dialog. Bodies are capped so
 *   a huge file cannot balloon memory.
 * Tech Stack: Rust, Tauri v2, reqwest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use tauri::State;

use crate::database::repository::provider_repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const RAW_PREFIX: &str = "https://raw.githubusercontent.com/Amey-Thakur/AI-SKILLS/main/";
const INDEX_URL: &str = "https://raw.githubusercontent.com/Amey-Thakur/AI-SKILLS/main/index.json";
const CACHE_KEY: &str = "agent_skills_index";
const CACHE_AT_KEY: &str = "agent_skills_fetched_at";
const CACHE_TTL_SECS: i64 = 24 * 3600;
const MAX_BODY_BYTES: usize = 64 * 1024;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AgentSkill {
    pub kind: String,
    pub name: String,
    pub description: String,
    pub raw_url: String,
}

fn parse_index(body: &str) -> Vec<AgentSkill> {
    #[derive(serde::Deserialize)]
    struct Index {
        #[serde(default)]
        entries: Vec<AgentSkill>,
    }
    serde_json::from_str::<Index>(body)
        .map(|index| {
            index
                .entries
                .into_iter()
                /* Trust nothing outside the fixed repository, even in our own
                catalog file. */
                .filter(|e| e.raw_url.starts_with(RAW_PREFIX))
                .collect()
        })
        .unwrap_or_default()
}

/// The AI-SKILLS catalog: cached copy when fresh, network refresh otherwise,
/// stale cache when offline, empty list when nothing is available yet.
#[tauri::command(rename_all = "snake_case")]
pub async fn fetch_agent_skills(app: tauri::AppHandle) -> AppResult<Vec<AgentSkill>> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state: State<'_, AppState> = app.state();

        let (cached, fetched_at) = {
            let conn = state.conn()?;
            (
                provider_repository::get_setting(&conn, CACHE_KEY)?,
                provider_repository::get_setting(&conn, CACHE_AT_KEY)?
                    .and_then(|v| v.parse::<i64>().ok()),
            )
        };

        let now = chrono::Utc::now().timestamp();
        let fresh = fetched_at.is_some_and(|at| now - at < CACHE_TTL_SECS);
        if fresh {
            if let Some(body) = cached.as_deref() {
                return Ok(parse_index(body));
            }
        }

        let fetched = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .ok()
            .and_then(|client| client.get(INDEX_URL).send().ok())
            .filter(|r| r.status().is_success())
            .and_then(|r| r.text().ok());

        match fetched {
            Some(body) => {
                let skills = parse_index(&body);
                /* Only cache a body that parsed into something. */
                if !skills.is_empty() {
                    let conn = state.conn()?;
                    provider_repository::set_setting(&conn, CACHE_KEY, &body)?;
                    provider_repository::set_setting(&conn, CACHE_AT_KEY, &now.to_string())?;
                }
                Ok(skills)
            }
            /* Offline: the stale cache is better than nothing. */
            None => Ok(cached.as_deref().map(parse_index).unwrap_or_default()),
        }
    })
    .await
    .map_err(|e| AppError::Internal(format!("Skills fetch task failed: {e}")))?
}

/// One entry's full markdown, for insertion into Prompt Studio. The URL must
/// belong to the fixed AI-SKILLS repository.
#[tauri::command(rename_all = "snake_case")]
pub async fn fetch_agent_skill_body(raw_url: String) -> AppResult<String> {
    if !raw_url.starts_with(RAW_PREFIX) {
        return Err(AppError::InvalidInput(
            "Only AI-SKILLS library entries can be fetched".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let response = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| AppError::Internal(format!("HTTP client build failed: {e}")))?
            .get(&raw_url)
            .send()
            .map_err(|_| AppError::Provider("Could not reach the skills library".into()))?;

        if !response.status().is_success() {
            return Err(AppError::Provider(format!(
                "Skills library answered with HTTP {}",
                response.status()
            )));
        }

        let body = response
            .text()
            .map_err(|e| AppError::Provider(format!("Unreadable skill body: {e}")))?;
        let capped: String = body.chars().take(MAX_BODY_BYTES).collect();
        Ok(capped)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Skill body task failed: {e}")))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_filters_foreign_urls() {
        let body = r#"{"entries":[
            {"kind":"skill","name":"code-review","description":"d","raw_url":"https://raw.githubusercontent.com/Amey-Thakur/AI-SKILLS/main/skills/code-review/SKILL.md"},
            {"kind":"skill","name":"evil","description":"d","raw_url":"https://evil.example.com/x.md"}
        ]}"#;
        let skills = parse_index(body);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "code-review");
    }

    #[test]
    fn malformed_index_yields_empty() {
        assert!(parse_index("not json").is_empty());
        assert!(parse_index("{}").is_empty());
    }
}
