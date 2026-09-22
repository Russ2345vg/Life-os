# REL-03 LifeOS Android v1.0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing LifeOS frontend as an installable Android v1.0.1 APK and refresh the Windows NSIS v1.0.1 installer.

**Architecture:** Keep React/Vite and the current application/domain/persistence layers authoritative. Add only Tauri's generated Android wrapper, required platform toolchain, and release metadata; validate the existing responsive UI and persistence in an emulator.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tauri 2.11, Rust, Android Studio/JBR, Android SDK 36, Gradle.

**Spec:** `docs/superpowers/specs/2026-09-03-rel-03-lifeos-android-design.md`

## Global Constraints

- Preserve all current uncommitted REL-02 and Goal Album work.
- Keep `com.lifeos.desktop`; do not create a second frontend or state source.
- Android artifact is a universal debug-signed APK, not AAB or Play release.
- Do not start iOS, updater, cloud/server work, new features, or broad refactors.
- Use one final full verification cycle; do not repeat already-green suites.
- Do not commit or push the mixed dirty worktree without separate authorization.

---

### Task 1: Install the missing supported Android toolchain

**Files:**

- Modify outside repository: Android Studio, user Android SDK, user Rust toolchains, user environment variables
- Inspect only: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

**Interfaces:**

- Consumes: official Android Studio Stable installer and Android SDK repositories
- Produces: working `java`, `sdkmanager`, `adb`, `emulator`, NDK, and four Rust Android targets

- [ ] Confirm disk space, current installed products, SDK folders, Java/JDK, Rust targets, and virtualization state.
- [ ] Install official Android Studio Stable only because it is absent; verify its installed version and bundled JBR.
- [ ] Install Platform 36, Build Tools 36.0.0, Platform Tools, Command-line Tools, Emulator, Google APIs x86_64 API 36 image, and the exact NDK revision required by Tauri/Gradle.
- [ ] Configure `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `NDK_HOME` to resolved absolute paths.
- [ ] Add `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, and `x86_64-linux-android` with `rustup target add`.
- [ ] Prove availability with version/list commands; record exact versions for the release report.

### Task 2: Generate Android packaging and set v1.0.1

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Generate: `src-tauri/gen/android/**`
- Modify only if required by reproduced build/runtime failure: `src-tauri/tauri.android.conf.json`, `vite.config.ts`, generated Android settings

**Interfaces:**

- Consumes: existing Tauri config and installed toolchain
- Produces: one Android wrapper for `com.lifeos.desktop`, versioned LifeOS 1.0.1

- [ ] Run a bounded metadata assertion that fails while any authoritative package version is not `1.0.1`.
- [ ] Change only the three authoritative package/lock version fields from `1.0.0` to `1.0.1`; keep Tauri's `../package.json` version reference and identifier unchanged.
- [ ] Re-run the metadata assertion and confirm `1.0.1` plus unchanged `com.lifeos.desktop`.
- [ ] Run standard non-interactive `npm run tauri android init -- --ci` with the resolved Android environment.
- [ ] Inspect generated diffs and reject any duplicate frontend, business logic, updater, iOS, or store-release scope.
- [ ] Run Tauri Android environment/project diagnostics and resolve only concrete generator/build blockers.

### Task 3: Launch and validate the existing mobile experience

**Files:**

- Modify product files only if an emulator-reproduced blocking defect requires a minimal repair
- Test: existing nearest tests for any modified product file

**Interfaces:**

- Consumes: generated Android project and existing responsive `ApplicationShell`
- Produces: emulator evidence for startup, navigation, Goal Album, forms, and persistence

- [ ] Create a named Google APIs API 36 x86_64 emulator and boot it to an `adb`-ready state.
- [ ] Launch LifeOS through the Tauri Android development command and confirm a real standalone Android application window without a blank screen or startup exception.
- [ ] Exercise the mobile menu/bottom navigation and open the main existing sections at phone dimensions.
- [ ] Open Goal Album, create recognizable emulator-only test data, and exercise its existing ready interaction.
- [ ] Check portrait scrolling, dialogs, focus, Android software keyboard, and system safe areas.
- [ ] Force-stop `com.lifeos.desktop`, relaunch without clearing data, and confirm Goal Album plus a localStorage-backed setting remain persisted.
- [ ] If a blocker is reproduced, add/run the nearest regression test before the minimal repair, then repeat only the affected Android scenario.

### Task 4: Produce and smoke-test the Android artifact

**Files:**

- Generate: `src-tauri/gen/android/app/build/outputs/apk/**`
- Generate: `src-tauri/target/android/LifeOS_1.0.1.apk`

**Interfaces:**

- Consumes: stable Android wrapper and v1.0.1 frontend
- Produces: installable universal debug-signed APK

- [ ] Build once with `npm run tauri android build -- --debug --apk`.
- [ ] Locate the universal APK, verify its package/version/signing metadata, and copy it to `src-tauri/target/android/LifeOS_1.0.1.apk`.
- [ ] Install the final APK on the emulator without clearing app data, launch it, and repeat the force-stop/relaunch persistence check.
- [ ] Record the final APK absolute path and byte size.

### Task 5: Run the single final release gate and rebuild Windows

**Files:**

- Generate: `dist/**`
- Generate: `src-tauri/target/release/bundle/nsis/**`
- Inspect: all worktree changes

**Interfaces:**

- Consumes: completed Android packaging and unchanged shared LifeOS code
- Produces: final verification evidence and refreshed Windows NSIS installer

- [ ] Run targeted tests only for product source files changed during Task 3; skip this substep if Android packaging required no product-code change.
- [ ] Run the single final full gate `npm run verify:full` because REL-03 validates mobile navigation and persistence.
- [ ] Run `npm run tauri build` once and confirm the v1.0.1 NSIS installer exists.
- [ ] Install/run the Windows v1.0.1 build as a smoke check without disturbing user data, then close the process created for QA.
- [ ] Record the NSIS absolute path and byte size.
- [ ] Run `git diff --check`, inspect `git diff --stat`, `git diff --name-status`, and `git status --short`.
- [ ] Report PASS or BLOCKED, exact toolchain, Android launch/Goal Album/persistence outcomes, both artifact paths and sizes, debug-signing limitation, and only genuine unresolved problems.
