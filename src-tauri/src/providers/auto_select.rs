/*
 * Name: auto_select.rs
 * Purpose: Pick the best provider for a task when automatic switching is on.
 * Description: A deliberately transparent heuristic, not a black box. Every
 *   registered model gets a capability tier (1 light, 2 solid, 3 flagship)
 *   from its kind and model name, then a purpose-dependent score: Fast work
 *   prefers light and local (free) models, Quality work prefers the highest
 *   tier with cloud flagships ahead of local peers, and Balanced sits in the
 *   middle preferring solid models and free local compute at equal tier. The
 *   router tries candidates in score order and falls back on failure, so one
 *   dead provider never fails a request that another could serve. Also home
 *   to the context-window table used for display and context budgeting:
 *   windows are listed only where they are known facts (the sidecar's is set
 *   by us; cloud windows are documented); unknown stays None rather than a
 *   guess.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use super::traits::TaskPurpose;

/// Capability tier: 1 light and fast, 2 solid all-rounder, 3 flagship.
pub fn tier(kind: &str, model: &str) -> u8 {
    let m = model.to_lowercase();

    /* A stated parameter count is the strongest signal for a local model: a
    1.5B "r1" is a light model no matter what its name evokes. */
    if let Some(size) = local_size_class(&m) {
        return match size {
            SizeClass::Small => 1,
            SizeClass::Mid | SizeClass::Large => 2,
        };
    }

    /* Flagship markers (cloud model ids carry no parameter count). */
    if m.contains("opus")
        || m.contains("gpt-5.1")
        || m.contains("2.5-pro")
        || m.contains("reasoner")
    {
        return 3;
    }

    /* Light/cheap markers. */
    if m.contains("mini") || m.contains("flash") || m.contains("haiku") || m.contains("lite") {
        return 1;
    }

    /* Cloud defaults to solid (sonnet, gpt-5, deepseek-chat, ...); unknown
    local models stay modest. */
    match kind {
        "anthropic" | "openai" | "gemini" | "deepseek" => 2,
        _ => 1,
    }
}

#[derive(PartialEq, Eq, Clone, Copy, Debug)]
enum SizeClass {
    Small,
    Mid,
    Large,
}

/// Parse a parameter-count hint out of a local model name ("llama3.2:3b",
/// "Llama-3.2-3B-Instruct-Q4_K_M", "qwen3:8b", "phi4:14b").
fn local_size_class(model: &str) -> Option<SizeClass> {
    let lower = model.to_lowercase();
    let bytes = lower.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'b' {
            /* Walk back over digits and a possible decimal point. */
            let mut j = i;
            while j > 0 && (bytes[j - 1].is_ascii_digit() || bytes[j - 1] == b'.') {
                j -= 1;
            }
            if j < i {
                /* The char before the number must not be alphanumeric, so
                "13b" in "b13b-x" style names still parses sanely. */
                let boundary_ok = j == 0 || !bytes[j - 1].is_ascii_alphanumeric();
                if boundary_ok {
                    if let Ok(size) = lower[j..i].parse::<f32>() {
                        return Some(if size < 5.0 {
                            SizeClass::Small
                        } else if size < 11.0 {
                            SizeClass::Mid
                        } else {
                            SizeClass::Large
                        });
                    }
                }
            }
        }
        i += 1;
    }
    None
}

/// Purpose-dependent score; higher is better. The router tries candidates in
/// descending order.
pub fn score(kind: &str, model: &str, is_local: bool, purpose: TaskPurpose) -> i32 {
    let tier = tier(kind, model) as i32;
    let local_bonus = if is_local { 1 } else { 0 };

    match purpose {
        /* Cheap and quick: light tiers first, free local compute preferred. */
        TaskPurpose::Fast => (4 - tier) * 10 + local_bonus * 5,
        /* Best result: highest tier first; at equal tier prefer cloud, which
        is faster than a large model grinding on consumer hardware. */
        TaskPurpose::Quality => tier * 10 + (1 - local_bonus) * 2,
        /* The sensible middle: solid models first, free local compute
        preferred at equal tier. */
        TaskPurpose::Balanced => 10 - (tier * 10 - 20).abs() + local_bonus * 3,
    }
}

/// Known context windows in tokens. The sidecar's is whatever we start
/// llama-server with (SIDECAR_CONTEXT_TOKENS in sidecar_service). Cloud
/// windows are the providers' documented figures. Ollama and custom endpoints
/// are None: their effective window is user configuration we cannot see, and
/// an honest display shows no percentage rather than a made-up one.
pub fn context_window(kind: &str, model: &str) -> Option<u32> {
    let m = model.to_lowercase();
    match kind {
        "sidecar" => Some(crate::services::sidecar_service::SIDECAR_CONTEXT_TOKENS),
        "anthropic" => Some(200_000),
        "gemini" => Some(1_048_576),
        "deepseek" => Some(131_072),
        "openai" => {
            if m.contains("gpt-5") {
                Some(256_000)
            } else {
                Some(128_000)
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_recognise_flagships_and_light_models() {
        assert_eq!(tier("anthropic", "claude-opus-4-8"), 3);
        assert_eq!(tier("openai", "gpt-5.1"), 3);
        assert_eq!(tier("gemini", "gemini-2.5-pro"), 3);
        assert_eq!(tier("deepseek", "deepseek-reasoner"), 3);
        /* A local 1.5B is light regardless of its reasoning-model name. */
        assert_eq!(tier("ollama", "deepseek-r1:1.5b"), 1);
        assert_eq!(tier("ollama", "deepseek-r1:7b"), 2);
        assert_eq!(tier("anthropic", "claude-sonnet-5"), 2);
        assert_eq!(tier("anthropic", "claude-haiku-4-5-20251001"), 1);
        assert_eq!(tier("gemini", "gemini-2.5-flash"), 1);
        assert_eq!(tier("ollama", "llama3.2:3b"), 1);
        assert_eq!(tier("ollama", "qwen3:8b"), 2);
        assert_eq!(tier("ollama", "phi4:14b"), 2);
        assert_eq!(tier("sidecar", "Llama-3.2-3B-Instruct-Q4_K_M"), 1);
    }

    #[test]
    fn fast_prefers_light_local_over_flagship_cloud() {
        let local_small = score("ollama", "llama3.2:3b", true, TaskPurpose::Fast);
        let cloud_flagship = score("anthropic", "claude-opus-4-8", false, TaskPurpose::Fast);
        assert!(local_small > cloud_flagship);
    }

    #[test]
    fn quality_prefers_flagship_over_local_small() {
        let cloud_flagship = score("anthropic", "claude-opus-4-8", false, TaskPurpose::Quality);
        let local_small = score("ollama", "llama3.2:3b", true, TaskPurpose::Quality);
        assert!(cloud_flagship > local_small);
    }

    #[test]
    fn quality_prefers_cloud_at_equal_tier() {
        let cloud_solid = score("anthropic", "claude-sonnet-5", false, TaskPurpose::Quality);
        let local_solid = score("ollama", "qwen3:8b", true, TaskPurpose::Quality);
        assert!(cloud_solid > local_solid);
    }

    #[test]
    fn balanced_prefers_solid_tier_and_free_compute() {
        let local_mid = score("ollama", "qwen3:8b", true, TaskPurpose::Balanced);
        let cloud_solid = score("openai", "gpt-4o", false, TaskPurpose::Balanced);
        let local_small = score("ollama", "gemma3:1b", true, TaskPurpose::Balanced);
        assert!(local_mid > cloud_solid);
        assert!(cloud_solid > local_small);
    }

    #[test]
    fn windows_are_stated_only_when_known() {
        assert_eq!(
            context_window("sidecar", "anything"),
            Some(crate::services::sidecar_service::SIDECAR_CONTEXT_TOKENS)
        );
        assert_eq!(
            context_window("anthropic", "claude-sonnet-5"),
            Some(200_000)
        );
        assert_eq!(context_window("openai", "gpt-5.1"), Some(256_000));
        assert_eq!(context_window("ollama", "llama3.2:3b"), None);
        assert_eq!(context_window("custom", "anything"), None);
    }
}
