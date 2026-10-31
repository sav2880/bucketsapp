// SPDX-License-Identifier: Apache-2.0

//! File storage for the app's data, used by `createTauriStorage` in `@buckets/storage`.
//!
//! This is OS integration only (plan.md §8.2): bytes in, bytes out, under the app data folder.
//! Keys look like `buckets/<id>` and `blobs/<hash>`. They are checked here as well as in
//! TypeScript, because this is the layer that touches the disk. Writes are atomic: the bytes go
//! to a temporary file in the same folder, are flushed, then renamed over the real file, so a
//! crash leaves the old file or the new one and never half of each.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

/// Longest a single part of a key may be.
const MAX_PART_LEN: usize = 128;
/// Most parts a key may have.
const MAX_PARTS: usize = 4;
/// Header that carries the key of a write, so the body can stay raw bytes.
const KEY_HEADER: &str = "x-storage-key";

/// Why a storage command failed. Serializes as `{ "kind": "not-found" }` and so on, which the
/// TypeScript adapter reads.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum StorageError {
    /// Nothing is stored under that key.
    NotFound,
    /// The key is empty, too long, or has characters that are not allowed.
    InvalidKey,
    /// The request had no bytes, or no key header.
    BadRequest,
    /// The operating system refused.
    Io {
        /// What the operating system said.
        message: String,
    },
}

impl From<io::Error> for StorageError {
    fn from(error: io::Error) -> Self {
        if error.kind() == io::ErrorKind::NotFound {
            StorageError::NotFound
        } else {
            StorageError::Io {
                message: error.to_string(),
            }
        }
    }
}

fn valid_part(part: &str) -> bool {
    let mut chars = part.chars();
    let starts_ok = chars.next().is_some_and(|c| c.is_ascii_alphanumeric());
    starts_ok
        && part.len() <= MAX_PART_LEN
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Turns a key into a path under `root`, or refuses it.
///
/// Accepts one to four parts split by `/`, each starting with a letter or digit and using only
/// letters, digits, `.`, `_` and `-`. That rules out `..`, absolute paths, backslashes, hidden
/// files (and so the `.tmp` files this module makes) and anything else surprising.
fn path_for(root: &Path, key: &str) -> Result<PathBuf, StorageError> {
    let parts: Vec<&str> = key.split('/').collect();
    if parts.len() > MAX_PARTS || !parts.iter().all(|part| valid_part(part)) {
        return Err(StorageError::InvalidKey);
    }
    Ok(parts
        .iter()
        .fold(root.to_path_buf(), |path, part| path.join(part)))
}

/// Reads the bytes stored under `key`.
///
/// # Errors
///
/// [`StorageError::NotFound`] when nothing is stored there, [`StorageError::InvalidKey`] for a
/// bad key, otherwise [`StorageError::Io`].
pub fn read_bytes(root: &Path, key: &str) -> Result<Vec<u8>, StorageError> {
    Ok(fs::read(path_for(root, key)?)?)
}

/// Stores `bytes` under `key`, replacing any earlier value atomically.
///
/// # Errors
///
/// [`StorageError::InvalidKey`] for a bad key, otherwise [`StorageError::Io`].
pub fn write_bytes(root: &Path, key: &str, bytes: &[u8]) -> Result<(), StorageError> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let target = path_for(root, key)?;
    let (Some(folder), Some(name)) = (target.parent(), target.file_name()) else {
        return Err(StorageError::InvalidKey);
    };
    fs::create_dir_all(folder)?;

    // Same folder, so the rename never crosses a file system. The leading dot keeps it out of
    // listings and out of the key alphabet.
    let temp = folder.join(format!(
        ".{}.tmp-{}-{}",
        name.to_string_lossy(),
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let written = (|| -> io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, &target)
    })();
    if let Err(error) = written {
        // Best effort: a leftover temp file is harmless but untidy.
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    sync_folder(folder);
    Ok(())
}

/// Asks the OS to record the rename itself, so it survives a power cut. Windows has no way to
/// open a folder for this, and NTFS journals renames anyway.
#[cfg(unix)]
fn sync_folder(folder: &Path) {
    if let Ok(dir) = fs::File::open(folder) {
        let _ = dir.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_folder(_folder: &Path) {}

/// Lists the keys stored directly under `prefix`, for example `buckets` gives `buckets/<id>`.
/// A prefix that does not exist yet lists as empty.
///
/// # Errors
///
/// [`StorageError::InvalidKey`] for a bad prefix, otherwise [`StorageError::Io`].
pub fn list_keys(root: &Path, prefix: &str) -> Result<Vec<String>, StorageError> {
    let folder = path_for(root, prefix)?;
    let entries = match fs::read_dir(&folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut keys = Vec::new();
    for entry in entries {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        // Temporary files and anything foreign fail the key rules and are skipped.
        if let Some(name) = entry.file_name().to_str().filter(|name| valid_part(name)) {
            keys.push(format!("{prefix}/{name}"));
        }
    }
    Ok(keys)
}

/// Deletes the value under `key`. A key with nothing stored is not an error.
///
/// # Errors
///
/// [`StorageError::InvalidKey`] for a bad key, otherwise [`StorageError::Io`].
pub fn remove_key(root: &Path, key: &str) -> Result<(), StorageError> {
    match fs::remove_file(path_for(root, key)?) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error.into()),
        _ => Ok(()),
    }
}

fn data_root(app: &AppHandle) -> Result<PathBuf, StorageError> {
    app.path().app_data_dir().map_err(|error| StorageError::Io {
        message: error.to_string(),
    })
}

/// Command: reads a value. The bytes come back raw, not as JSON.
///
/// # Errors
///
/// See [`read_bytes`].
#[tauri::command]
pub fn storage_read(app: AppHandle, key: String) -> Result<Response, StorageError> {
    Ok(Response::new(read_bytes(&data_root(&app)?, &key)?))
}

/// Command: writes a value. The key is in the `x-storage-key` header and the body is the raw
/// bytes.
///
/// # Errors
///
/// [`StorageError::BadRequest`] without a key header or a raw body, otherwise see [`write_bytes`].
#[tauri::command]
pub fn storage_write(app: AppHandle, request: Request<'_>) -> Result<(), StorageError> {
    let key = request
        .headers()
        .get(KEY_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(StorageError::BadRequest)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(StorageError::BadRequest);
    };
    write_bytes(&data_root(&app)?, key, bytes)
}

/// Command: lists keys under a prefix.
///
/// # Errors
///
/// See [`list_keys`].
#[tauri::command]
pub fn storage_list(app: AppHandle, prefix: String) -> Result<Vec<String>, StorageError> {
    list_keys(&data_root(&app)?, &prefix)
}

/// Command: deletes a value.
///
/// # Errors
///
/// See [`remove_key`].
#[tauri::command]
pub fn storage_remove(app: AppHandle, key: String) -> Result<(), StorageError> {
    remove_key(&data_root(&app)?, &key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh folder under the system temp dir, removed when dropped.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            static N: AtomicU64 = AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "buckets-storage-test-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create temp dir");
            TempDir(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_back_what_was_written() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "buckets/a", &[1, 2, 3]).unwrap();
        assert_eq!(read_bytes(&dir.0, "buckets/a").unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn replaces_a_value_completely_and_leaves_no_temp_file() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "library", &[1, 2, 3, 4]).unwrap();
        write_bytes(&dir.0, "library", &[9]).unwrap();
        assert_eq!(read_bytes(&dir.0, "library").unwrap(), vec![9]);
        let names: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from("library")]);
    }

    #[test]
    fn reports_a_missing_key() {
        let dir = TempDir::new();
        assert_eq!(
            read_bytes(&dir.0, "buckets/none"),
            Err(StorageError::NotFound)
        );
    }

    #[test]
    fn refuses_unsafe_keys_everywhere() {
        let dir = TempDir::new();
        let long = "x".repeat(MAX_PART_LEN + 1);
        let bad = [
            "../x",
            "a/../b",
            "/abs",
            "a//b",
            "",
            ".hidden",
            "a b",
            "a\\b",
            "C:\\x",
            "a/b/c/d/e",
            "nul\0",
            "é",
            long.as_str(),
        ];
        for key in bad {
            assert_eq!(
                read_bytes(&dir.0, key),
                Err(StorageError::InvalidKey),
                "{key:?}"
            );
            assert_eq!(
                write_bytes(&dir.0, key, &[1]),
                Err(StorageError::InvalidKey),
                "{key:?}"
            );
            assert_eq!(
                list_keys(&dir.0, key),
                Err(StorageError::InvalidKey),
                "{key:?}"
            );
            assert_eq!(
                remove_key(&dir.0, key),
                Err(StorageError::InvalidKey),
                "{key:?}"
            );
        }
        assert!(
            fs::read_dir(&dir.0).unwrap().next().is_none(),
            "nothing was created"
        );
    }

    #[test]
    fn lists_only_files_directly_under_the_prefix() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "buckets/a", &[1]).unwrap();
        write_bytes(&dir.0, "buckets/b", &[1]).unwrap();
        write_bytes(&dir.0, "blobs/c", &[1]).unwrap();
        write_bytes(&dir.0, "buckets/deep/d", &[1]).unwrap();
        let mut keys = list_keys(&dir.0, "buckets").unwrap();
        keys.sort();
        assert_eq!(keys, vec!["buckets/a", "buckets/b"]);
        assert_eq!(list_keys(&dir.0, "nothing").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn a_crash_mid_write_leaves_the_old_value_and_does_not_block_the_next_write() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "library", b"good").unwrap();
        // What a killed write leaves behind: a partial temp file next to the real one.
        fs::write(dir.0.join(".library.tmp-1-1"), b"par").unwrap();
        assert_eq!(read_bytes(&dir.0, "library").unwrap(), b"good");
        assert_eq!(
            list_keys(&dir.0, "library").unwrap_or_default(),
            Vec::<String>::new()
        );
        write_bytes(&dir.0, "library", b"newer").unwrap();
        assert_eq!(read_bytes(&dir.0, "library").unwrap(), b"newer");
    }

    #[test]
    fn temp_files_are_not_listed() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "buckets/a", &[1]).unwrap();
        fs::write(dir.0.join("buckets/.a.tmp-1-1"), b"x").unwrap();
        assert_eq!(list_keys(&dir.0, "buckets").unwrap(), vec!["buckets/a"]);
    }

    #[test]
    fn removes_values_and_ignores_missing_ones() {
        let dir = TempDir::new();
        write_bytes(&dir.0, "buckets/a", &[1]).unwrap();
        remove_key(&dir.0, "buckets/a").unwrap();
        remove_key(&dir.0, "buckets/a").unwrap();
        assert_eq!(read_bytes(&dir.0, "buckets/a"), Err(StorageError::NotFound));
    }

    #[test]
    fn a_folder_in_the_way_is_an_io_error_not_a_panic() {
        let dir = TempDir::new();
        fs::create_dir_all(dir.0.join("library")).unwrap();
        assert!(matches!(
            write_bytes(&dir.0, "library", &[1]),
            Err(StorageError::Io { .. })
        ));
    }

    #[test]
    fn errors_serialize_with_a_kind_for_the_frontend() {
        let json = |e: &StorageError| serde_json::to_string(e).unwrap();
        assert_eq!(json(&StorageError::NotFound), r#"{"kind":"not-found"}"#);
        assert_eq!(json(&StorageError::InvalidKey), r#"{"kind":"invalid-key"}"#);
        assert_eq!(json(&StorageError::BadRequest), r#"{"kind":"bad-request"}"#);
        assert_eq!(
            json(&StorageError::Io {
                message: "x".into()
            }),
            r#"{"kind":"io","message":"x"}"#
        );
    }
}
