/*
 * Name: provider_repository.rs
 * Purpose: Data access for persisted AI provider configurations.
 * Description: Stores registered providers (kind, endpoint, model, optional
 *   API key) so cloud connections and model choices survive restarts. Name is
 *   the natural key because the router replaces providers by name. The API key
 *   never leaves this layer except to construct a live provider instance; the
 *   list queries the frontend sees expose only whether a key exists.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use rusqlite::{params, Connection};

use crate::error::AppResult;

/// A provider as persisted. `api_key` is optional: local endpoints rarely
/// need one.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub is_local: bool,
}

/// Insert or update a provider by name.
pub fn upsert(conn: &Connection, config: &ProviderConfig) -> AppResult<()> {
    conn.execute(
        "INSERT INTO providers (name, kind, base_url, api_key, model, is_local, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(name) DO UPDATE SET
             kind = excluded.kind,
             base_url = excluded.base_url,
             api_key = excluded.api_key,
             model = excluded.model,
             is_local = excluded.is_local,
             updated_at = datetime('now')",
        params![
            config.name,
            config.kind,
            config.base_url,
            config.api_key,
            config.model,
            config.is_local,
        ],
    )?;
    Ok(())
}

/// All saved providers, oldest first so restore order (and router indexes)
/// stay stable across restarts.
pub fn list(conn: &Connection) -> AppResult<Vec<ProviderConfig>> {
    let mut stmt = conn.prepare(
        "SELECT name, kind, base_url, api_key, model, is_local
         FROM providers ORDER BY created_at, name",
    )?;
    let configs = stmt
        .query_map([], |row| {
            Ok(ProviderConfig {
                name: row.get(0)?,
                kind: row.get(1)?,
                base_url: row.get(2)?,
                api_key: row.get(3)?,
                model: row.get(4)?,
                is_local: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(configs)
}

/// Delete a provider by name. Returns true when a row was removed.
pub fn delete(conn: &Connection, name: &str) -> AppResult<bool> {
    let affected = conn.execute("DELETE FROM providers WHERE name = ?1", params![name])?;
    Ok(affected > 0)
}

/// Read a settings value (used for the persisted active-provider choice).
pub fn get_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let value = stmt
        .query_map(params![key], |row| row.get::<_, String>(0))?
        .next()
        .transpose()?;
    Ok(value)
}

/// Write a settings value.
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

/// Remove a settings value.
pub fn clear_setting(conn: &Connection, key: &str) -> AppResult<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
            .unwrap();
        conn.execute_batch(include_str!(
            "../../../resources/migrations/006_providers.sql"
        ))
        .unwrap();
        conn
    }

    fn sample(name: &str) -> ProviderConfig {
        ProviderConfig {
            name: name.into(),
            kind: "openai".into(),
            base_url: "https://api.openai.com".into(),
            api_key: Some("sk-test".into()),
            model: "gpt-5.1".into(),
            is_local: false,
        }
    }

    #[test]
    fn upsert_inserts_then_updates() {
        let conn = test_conn();
        upsert(&conn, &sample("OpenAI")).unwrap();
        let mut updated = sample("OpenAI");
        updated.model = "gpt-5-mini".into();
        upsert(&conn, &updated).unwrap();

        let saved = list(&conn).unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].model, "gpt-5-mini");
        assert_eq!(saved[0].api_key.as_deref(), Some("sk-test"));
    }

    #[test]
    fn delete_removes_and_reports() {
        let conn = test_conn();
        upsert(&conn, &sample("OpenAI")).unwrap();
        assert!(delete(&conn, "OpenAI").unwrap());
        assert!(!delete(&conn, "OpenAI").unwrap());
        assert!(list(&conn).unwrap().is_empty());
    }

    #[test]
    fn settings_round_trip() {
        let conn = test_conn();
        assert_eq!(get_setting(&conn, "active_provider_name").unwrap(), None);
        set_setting(&conn, "active_provider_name", "OpenAI").unwrap();
        assert_eq!(
            get_setting(&conn, "active_provider_name")
                .unwrap()
                .as_deref(),
            Some("OpenAI")
        );
        clear_setting(&conn, "active_provider_name").unwrap();
        assert_eq!(get_setting(&conn, "active_provider_name").unwrap(), None);
    }
}
