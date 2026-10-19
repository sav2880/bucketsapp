// SPDX-License-Identifier: Apache-2.0

//! Entry point for the Buckets desktop app. All logic lives in the library crate.

// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = buckets_desktop_lib::run() {
        eprintln!("Buckets failed to start: {error}");
        std::process::exit(1);
    }
}
