# REL-04 LifeOS Android Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a permanently signed universal Android release APK for LifeOS 1.0.1 that can be installed now and updated later with the same key.

**Architecture:** Keep the existing React/Tauri application unchanged. Add only Gradle release-signing configuration backed by a local Git-ignored properties file and a keystore stored outside the repository, then build and verify the release APK.

**Tech Stack:** React 19, Vite 8, Tauri 2.11, Rust, Gradle, Android SDK 36, JDK 21.

**Spec:** `docs/superpowers/specs/2026-09-03-rel-03-lifeos-android-design.md` plus the REL-04 user acceptance criteria dated 2026-09-03.

## Global Constraints

- Keep LifeOS functionality, design, package id `com.lifeos.desktop`, and version `1.0.1` unchanged.
- Do not add dependencies or start iOS, cloud, updater, Google Play, AAB, or Windows work.
- Store the permanent keystore outside Git and store its passwords only in a local ignored file.
- Build one universal release APK and do not run unnecessary debug builds.
- Do not clear Android application data during installation.

---

### Task 1: Configure private release signing

**Files:**

- Modify: `.gitignore`
- Modify: `src-tauri/gen/android/app/build.gradle.kts`
- Create outside Git: `D:/Android/LifeOS/signing/lifeos-release.jks`
- Create ignored local file: `src-tauri/gen/android/keystore.properties`

**Interfaces:**

- Consumes: Gradle release build type and standard Java keystore properties.
- Produces: a release variant signed with alias `lifeos-release` while debug builds remain usable without release secrets.

- [ ] Add defensive Git ignore patterns for Java keystores and signing property files.
- [ ] Load `keystore.properties` in Gradle and fail a requested release build when it is absent.
- [ ] Generate a random store password and key password without printing them.
- [ ] Create the long-lived PKCS12 keystore with `keytool` and alias `lifeos-release`.
- [ ] Save only the absolute keystore path and passwords in the ignored local properties file.
- [ ] Prove with `git check-ignore` and `git status --short` that neither secret file nor keystore is tracked.

### Task 2: Build and verify the production APK

**Files:**

- Generate: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
- Generate: `src-tauri/target/android/LifeOS_1.0.1_android_release.apk`

**Interfaces:**

- Consumes: signed Gradle release configuration and the existing LifeOS frontend.
- Produces: one installable, update-stable universal APK for Android 7.0 and later.

- [ ] Run `npm run tauri android build -- --apk --ci` with the existing bounded local Android toolchain environment.
- [ ] Copy the generated universal release APK to the requested stable filename.
- [ ] Verify APK signature schemes, signer certificate, package id, version code, and version name with Android Build Tools.
- [ ] Record the APK byte size and SHA-256 digest.

### Task 3: Install when a physical phone is present and run the release gate

**Files:**

- Inspect only: final repository diff and status.

**Interfaces:**

- Consumes: the final signed APK and ADB device list.
- Produces: non-destructive phone installation evidence when exactly one authorized physical device is attached, plus final release evidence.

- [ ] Query `adb devices -l` once and distinguish physical hardware from emulators.
- [ ] If a physical authorized device exists, run `adb install -r` and launch `com.lifeos.desktop`; never uninstall or clear data.
- [ ] Run the single final `npm run verify:full` gate required for the R12 production release stage.
- [ ] Run `git diff --check`, inspect the final diff/status, and scan tracked/untracked paths for release secrets.
- [ ] Report REL-04 PASS only when the production APK, release signature, Git exclusions, and required checks have direct evidence.
