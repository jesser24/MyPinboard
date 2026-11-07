#!/usr/bin/env bash
# Type-check the Windows-only Rust code from Linux (std is built from rust-src for the windows-gnu target).
# This proves the code COMPILES against the real Win32 bindings; it does not run anything.
set -euo pipefail
cd "$(dirname "$0")/.."
RUSTC_BOOTSTRAP=1 cargo check -Zbuild-std=std,panic_abort --target x86_64-pc-windows-gnu -p mypinboard "$@"
