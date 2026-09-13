import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAndroidManifest,
  buildWindowsManifest,
  expectedAndroidVersionCode,
  validateReleaseVersion,
} from './release-publish.mjs';

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
