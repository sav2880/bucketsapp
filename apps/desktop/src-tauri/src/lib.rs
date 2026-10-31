// SPDX-License-Identifier: Apache-2.0

//! Buckets desktop shell.
//!
//! Rust here handles OS integration only (menus, window effects, plugins). Business logic
//! belongs in TypeScript `@buckets/core` (AGENTS.md §5). The [`storage`] module reads and writes
//! the app's data files; the tray, notifications and file dialogs arrive in later milestones.

#![warn(missing_docs)]
#![deny(clippy::unwrap_used, clippy::expect_used)]

pub mod storage;

/// Starts the app and blocks until the last window closes.
///
/// # Errors
///
/// Returns the underlying Tauri error if the runtime or window can't be created.
pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            storage::storage_read,
            storage::storage_write,
            storage::storage_list,
            storage::storage_remove
        ])
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    const CONFIG: &str = include_str!("../tauri.conf.json");

    #[test]
    fn config_is_valid_json_with_one_window_titled_buckets() -> Result<(), serde_json::Error> {
        let config: Value = serde_json::from_str(CONFIG)?;
        assert_eq!(config["productName"], "Buckets");
        let windows = config["app"]["windows"].as_array().map(Vec::len);
        assert_eq!(windows, Some(1));
        assert_eq!(config["app"]["windows"][0]["title"], "Buckets");
        Ok(())
    }

    #[test]
    fn config_keeps_a_content_security_policy() -> Result<(), serde_json::Error> {
        let config: Value = serde_json::from_str(CONFIG)?;
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .unwrap_or_default();
        assert!(csp.contains("default-src 'self'"));
        // Thumbnails come from blob: URLs, and Automerge runs as WebAssembly.
        assert!(csp.contains("img-src 'self' data: blob:"));
        assert!(csp.contains("script-src 'self' 'wasm-unsafe-eval'"));
        Ok(())
    }
}
