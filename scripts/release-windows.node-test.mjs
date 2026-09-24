import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePreparedRelease, preserveAndroidManifest } from './release-windows.mjs';

test('refuses a prepared bundle with a missing or changed asset', () => {
  const receipt = { version: '1.0.14', files: { 'latest.json': 'abc', 'installer.exe': 'def' } };
  assert.doesNotThrow(() =>
    validatePreparedRelease(receipt, '1.0.14', (name) => receipt.files[name]),
  );
  assert.throws(() => validatePreparedRelease(receipt, '1.0.14', () => 'changed'), /changed/);
  assert.throws(() => validatePreparedRelease(receipt, '1.0.15', () => 'abc'), /version/i);
  assert.throws(
    () => validatePreparedRelease({ version: '1.0.14', files: {} }, '1.0.14', () => ''),
    /empty/,
  );
  assert.throws(
    () =>
      validatePreparedRelease(
        { version: '1.0.14', files: { '../secret': 'x' } },
        '1.0.14',
        () => 'x',
      ),
    /name/,
  );
});

test('carries forward the Android feed unchanged and refuses a mutable APK link', () => {
  const manifest = {
    version: '1.0.13',
    apkUrl:
      'https://github.com/Russ2345vg/LifeOS-Releases/releases/download/v1.0.13/LifeOS_1.0.13_android_release.apk',
  };
  assert.deepEqual(preserveAndroidManifest(manifest), manifest);
  assert.throws(
    () =>
      preserveAndroidManifest({
        ...manifest,
        apkUrl: 'https://github.com/Russ2345vg/LifeOS-Releases/releases/latest/download/app.apk',
      }),
    /immutable/,
  );
});
