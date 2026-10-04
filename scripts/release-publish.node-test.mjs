import assert from 'node:assert/strict';
import test from 'node:test';
import * as releaseModule from './release-publish.mjs';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAndroidManifest,
  buildReleasePath,
  buildReleaseConfig,
  buildWindowsManifest,
  expectedAndroidVersionCode,
  selectAndroidApk,
  validateReleaseVersion,
  selectWindowsInstaller,
  parseReleaseArguments,
  writePreparedRelease,
  loadPreparedRelease,
} from './release-publish.mjs';

test('requires an explicit release action so publish cannot start a build', () => {
  assert.deepEqual(parseReleaseArguments(['publish', '1.0.30', '--owner', 'lifeos-owner']), {
    action: 'publish',
    version: '1.0.30',
    owner: 'lifeos-owner',
    notes: '',
  });
  assert.throws(
    () => parseReleaseArguments(['1.0.30', '--owner', 'lifeos-owner']),
    /prepare\|publish/,
  );
  assert.throws(() => parseReleaseArguments(['prepare', '1.0.30', '--prepare-only']), /Unknown/);
});

test('publishes only complete prepared assets from the matching source commit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifeos-prepared-release-'));
  const version = '1.0.30';
  const assets = [
    `LifeOS_${version}_x64-setup.exe`,
    `LifeOS_${version}_x64-setup.exe.sig`,
    `LifeOS_${version}_android_release.apk`,
    'latest.json',
    'android-latest.json',
    'SHA256SUMS.txt',
  ];
  try {
    for (const name of assets) writeFileSync(join(directory, name), `content:${name}`);
    writePreparedRelease({
      directory,
      owner: 'lifeos-owner',
      version,
      notes: 'Release notes',
      commit: 'abc123',
      assets,
    });
    const prepared = loadPreparedRelease({
      directory,
      owner: 'lifeos-owner',
      version,
      commit: 'abc123',
    });
    assert.deepEqual(
      prepared.assets.map((path) => path.slice(directory.length + 1)),
      assets,
    );
    assert.equal(prepared.notes, 'Release notes');
    assert.throws(
      () => loadPreparedRelease({ directory, owner: 'other-owner', version, commit: 'abc123' }),
      /owner mismatch/,
    );
    assert.throws(
      () =>
        loadPreparedRelease({
          directory,
          owner: 'lifeos-owner',
          version: '1.0.31',
          commit: 'abc123',
        }),
      /version mismatch/,
    );
    assert.throws(
      () => loadPreparedRelease({ directory, owner: 'lifeos-owner', version, commit: 'different' }),
      /commit mismatch/,
    );
    writeFileSync(join(directory, assets[0]), 'tampered');
    assert.throws(
      () => loadPreparedRelease({ directory, owner: 'lifeos-owner', version, commit: 'abc123' }),
      /changed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('preserves the mixed-case Windows Path value', () => {
  assert.equal(
    buildReleasePath({ Path: 'C:\\Program Files\\nodejs;C:\\Windows\\System32' }),
    'D:\\Android\\CargoHome\\bin;D:\\Android\\RustupHome\\toolchains\\stable-x86_64-pc-windows-msvc\\bin;C:\\Program Files\\nodejs;C:\\Windows\\System32',
  );
});

test('ships the Tauri activity source required by a clean Android checkout', () => {
  const activity = readFileSync(
    join(
      import.meta.dirname,
      '..',
      'src-tauri',
      'gen',
      'android',
      'app',
      'src',
      'main',
      'java',
      'com',
      'lifeos',
      'desktop',
      'generated',
      'TauriActivity.kt',
    ),
    'utf8',
  );
  assert.match(activity, /package com\.lifeos\.desktop/);
  assert.match(activity, /abstract class TauriActivity : WryActivity\(\)/);
});

test('disables the nested Tauri frontend build command', () => {
  const config = buildReleaseConfig({
    owner: 'lifeos-owner',
    publicKey: 'public-key',
  });

  assert.equal(config.build.beforeBuildCommand, '');
  assert.deepEqual(config.plugins.updater.endpoints, [
    'https://github.com/lifeos-owner/LifeOS-Releases/releases/latest/download/latest.json',
  ]);
});

test('never relabels an old installer as a new version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifeos-release-test-'));
  try {
    writeFileSync(join(directory, 'LifeOS_1.0.0_x64-setup.exe'), 'old');
    assert.throws(() => selectWindowsInstaller(directory, '1.0.14'), /was not produced/);
    const current = join(directory, 'LifeOS_1.0.14_x64-setup.exe');
    writeFileSync(current, 'new');
    assert.equal(selectWindowsInstaller(directory, '1.0.14'), current);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('selects the release APK when its parent path also contains release', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifeos-release-1-0-23-'));
  try {
    const debugDirectory = join(directory, 'outputs', 'apk', 'universal', 'debug');
    const releaseDirectory = join(directory, 'outputs', 'apk', 'universal', 'release');
    mkdirSync(debugDirectory, { recursive: true });
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(join(debugDirectory, 'app-universal-debug.apk'), 'debug');
    const releaseApk = join(releaseDirectory, 'app-universal-release.apk');
    writeFileSync(releaseApk, 'release');

    assert.equal(selectAndroidApk(directory), releaseApk);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('maps semantic versions to monotonically increasing Android version codes', () => {
  assert.equal(expectedAndroidVersionCode('1.0.2'), 1_000_002);
  assert.equal(expectedAndroidVersionCode('1.1.0'), 1_001_000);
  assert.equal(expectedAndroidVersionCode('2.0.0'), 2_000_000);
});

test('rejects unsafe release versions', () => {
  assert.throws(() => validateReleaseVersion('1.0'), /X.Y.Z/);
  assert.throws(() => validateReleaseVersion('1.0.2-beta'), /X.Y.Z/);
  assert.doesNotThrow(() => validateReleaseVersion('1.0.2'));
});

test('embeds the signature content and immutable release asset URLs', () => {
  const windows = buildWindowsManifest({
    owner: 'lifeos-owner',
    version: '1.0.2',
    notes: 'Bootstrap updater.',
    pubDate: '2026-09-03T10:00:00.000Z',
    signature: 'signature-content',
  });
  const android = buildAndroidManifest({
    owner: 'lifeos-owner',
    version: '1.0.2',
    notes: 'Bootstrap updater.',
    sha256: 'a'.repeat(64),
  });

  assert.equal(windows.platforms['windows-x86_64'].signature, 'signature-content');
  assert.match(windows.platforms['windows-x86_64'].url, /releases\/download\/v1\.0\.2/);
  assert.equal(android.versionCode, 1_000_002);
  assert.equal(android.packageId, 'com.lifeos.desktop');
  assert.match(android.apkUrl, /LifeOS_1\.0\.2_android_release\.apk$/);
});

test('keeps the Tauri plugin manager JNI bridge in tracked release rules', () => {
  const rules = readFileSync(
    join(import.meta.dirname, '..', 'src-tauri', 'gen', 'android', 'app', 'proguard-rules.pro'),
    'utf8',
  );

  assert.match(rules, /-keep class com\.lifeos\.desktop\.TauriActivity/);
  assert.match(rules, /public app\.tauri\.plugin\.PluginManager getPluginManager\(\);/);
});
test('rejects a release APK whose Tauri JNI bridge was stripped', () => {
  assert.throws(
    () =>
      releaseModule.assertAndroidJniBridge(
        '.class public abstract Lcom/lifeos/desktop/TauriActivity;',
      ),
    /getPluginManager/,
  );
  assert.doesNotThrow(() =>
    releaseModule.assertAndroidJniBridge(
      '    app.tauri.plugin.PluginManager getPluginManager() -> getPluginManager',
    ),
  );
});
