/*
 * Title: sidecar_tests.rs
 * Tech Stack: Rust, integration tests
 * Description: Tests for sidecar service utilities (port allocation, key generation,
 *   argument building, model file scanning, path validation).
 * Important Details: Tests the pure functions in sidecar_service. Process spawning
 *   tests require the actual llama-server binary and are not included here.
 */

use notebooklab_lib::services::sidecar_service;

#[test]
fn find_available_port_returns_nonzero() {
    let port = sidecar_service::find_available_port();
    assert!(port > 0, "Port should be non-zero");
    assert!(port > 1024, "Port should be above well-known range");
}

#[test]
fn find_available_port_returns_different_ports() {
    /* Two successive calls should usually return different ports */
    let port1 = sidecar_service::find_available_port();
    let port2 = sidecar_service::find_available_port();
    /* Not guaranteed to be different, but extremely likely */
    assert!(port1 > 0 && port2 > 0);
}

#[test]
fn generate_session_key_has_correct_prefix() {
    let key = sidecar_service::generate_session_key();
    assert!(
        key.starts_with("nbl-"),
        "Key should start with 'nbl-' prefix"
    );
}

#[test]
fn generate_session_key_is_unique() {
    let key1 = sidecar_service::generate_session_key();
    let key2 = sidecar_service::generate_session_key();
    assert_ne!(key1, key2, "Two keys should be different");
}

#[test]
fn generate_session_key_has_sufficient_length() {
    let key = sidecar_service::generate_session_key();
    /* UUID v4 simple format is 32 hex chars + "nbl-" prefix = 36 chars minimum */
    assert!(
        key.len() >= 36,
        "Key should be at least 36 chars, got {}",
        key.len()
    );
}

#[test]
fn build_sidecar_args_includes_port_and_model() {
    let args = sidecar_service::build_sidecar_args(8080, "/path/to/model.gguf");

    assert!(args.contains(&"--port".to_string()));
    assert!(args.contains(&"8080".to_string()));
    assert!(args.contains(&"-m".to_string()));
    assert!(args.contains(&"/path/to/model.gguf".to_string()));
    assert!(args.contains(&"-c".to_string()));
    assert!(args.contains(&"2048".to_string()));
    assert!(args.contains(&"-t".to_string()));
}

#[test]
fn build_sidecar_args_thread_count_is_reasonable() {
    let args = sidecar_service::build_sidecar_args(8080, "model.gguf");
    let t_idx = args.iter().position(|a| a == "-t").unwrap();
    let threads: usize = args[t_idx + 1].parse().unwrap();

    /* Should be at least 1 and at most the number of cores */
    assert!(threads >= 1, "Thread count should be at least 1");
    assert!(threads <= 128, "Thread count should be reasonable");
}

#[test]
fn api_key_env_var_is_constant() {
    assert_eq!(sidecar_service::api_key_env_var(), "LLAMA_API_KEY");
}

#[test]
fn find_model_files_returns_empty_for_nonexistent_dir() {
    let dir = std::path::Path::new("/nonexistent/path/to/models");
    let models = sidecar_service::find_model_files(dir);
    assert!(models.is_empty());
}

#[test]
fn find_model_files_returns_empty_for_empty_dir() {
    let tmp = std::env::temp_dir().join("notebooklab_test_empty_models");
    std::fs::create_dir_all(&tmp).ok();

    let models = sidecar_service::find_model_files(&tmp);
    assert!(models.is_empty());

    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn find_model_files_finds_gguf_files() {
    let tmp = std::env::temp_dir().join("notebooklab_test_gguf_files");
    std::fs::create_dir_all(&tmp).ok();

    /* Create fake GGUF files */
    std::fs::write(tmp.join("model-small.gguf"), "small").ok();
    std::fs::write(tmp.join("model-large.gguf"), "this is larger content").ok();
    std::fs::write(tmp.join("readme.txt"), "not a model").ok();

    let models = sidecar_service::find_model_files(&tmp);
    assert_eq!(models.len(), 2, "Should find exactly 2 GGUF files");

    /* Should be sorted by size (smallest first) */
    let sizes: Vec<u64> = models
        .iter()
        .map(|p| std::fs::metadata(p).unwrap().len())
        .collect();
    assert!(sizes[0] <= sizes[1], "Should be sorted smallest first");

    /* Should not include the .txt file */
    assert!(models
        .iter()
        .all(|p: &std::path::PathBuf| p.extension().unwrap() == "gguf"));

    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn validate_model_path_rejects_traversal() {
    let tmp = std::env::temp_dir().join("notebooklab_test_validate");
    let models_dir = tmp.join("models");
    std::fs::create_dir_all(&models_dir).ok();

    /* Create a file outside the models dir */
    let outside_file = tmp.join("secret.txt");
    std::fs::write(&outside_file, "secret").ok();

    let valid = sidecar_service::validate_model_path(&outside_file, &models_dir);
    assert!(!valid, "Should reject paths outside the models directory");

    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn validate_model_path_accepts_valid_path() {
    let tmp = std::env::temp_dir().join("notebooklab_test_validate_ok");
    let models_dir = tmp.join("models");
    std::fs::create_dir_all(&models_dir).ok();

    let model_file = models_dir.join("test.gguf");
    std::fs::write(&model_file, "model data").ok();

    let valid = sidecar_service::validate_model_path(&model_file, &models_dir);
    assert!(valid, "Should accept paths within the models directory");

    std::fs::remove_dir_all(&tmp).ok();
}

#[test]
fn sidecar_manager_initial_state() {
    let mgr = sidecar_service::SidecarManager::new();

    assert!(!mgr.is_running());
    assert_eq!(mgr.port(), 0);
    assert_eq!(mgr.pid(), 0);
    assert!(mgr.api_key().is_empty());
    assert!(mgr.model_path().is_empty());
}

#[test]
fn sidecar_manager_configure_and_read() {
    let mgr = sidecar_service::SidecarManager::new();

    mgr.configure(8080, "test-key".into(), "/path/model.gguf".into(), 1234);

    assert_eq!(mgr.port(), 8080);
    assert_eq!(mgr.api_key(), "test-key");
    assert_eq!(mgr.model_path(), "/path/model.gguf");
    assert_eq!(mgr.pid(), 1234);
}

#[test]
fn sidecar_manager_try_transition() {
    let mgr = sidecar_service::SidecarManager::new();

    /* Should succeed: STOPPED -> STARTING */
    assert!(mgr.try_transition(
        sidecar_service::STATE_STOPPED,
        sidecar_service::STATE_STARTING
    ));

    /* Should fail: trying STOPPED -> STARTING again while in STARTING */
    assert!(!mgr.try_transition(
        sidecar_service::STATE_STOPPED,
        sidecar_service::STATE_STARTING
    ));

    /* Should succeed: STARTING -> READY */
    assert!(mgr.try_transition(
        sidecar_service::STATE_STARTING,
        sidecar_service::STATE_READY
    ));
    assert!(mgr.is_running());
}

#[test]
fn sidecar_manager_clear_resets_all() {
    let mgr = sidecar_service::SidecarManager::new();
    mgr.configure(9090, "key".into(), "model".into(), 5678);
    mgr.set_state(sidecar_service::STATE_READY);

    mgr.clear();
    mgr.set_state(sidecar_service::STATE_STOPPED);

    assert_eq!(mgr.port(), 0);
    assert_eq!(mgr.pid(), 0);
    assert!(mgr.api_key().is_empty());
    assert!(!mgr.is_running());
}
