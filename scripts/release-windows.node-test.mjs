import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validatePreparedRelease,
  preserveAndroidManifest,
  resolveWindowsBuildEnvironment,
  resolveWindowsSigningDirectory,
} from './release-windows.mjs';
import { join } from 'node:path';

test('uses configured signing and toolchain folders without replacing the existing PATH', () => {
  const environment = {
    LIFEOS_SIGNING_DIR: 'C:/private/signing',
    CARGO_HOME: 'C:/build/cargo',
    RUSTUP_HOME: 'C:/build/rustup',
    PATH: 'C:/node;C:/Windows/System32',
  };
  const build = resolveWindowsBuildEnvironment(environment);
  assert.equal(resolveWindowsSigningDirectory(environment), environment.LIFEOS_SIGNING_DIR);
  assert.equal(build.CARGO_HOME, environment.CARGO_HOME);
  assert.equal(build.RUSTUP_HOME, environment.RUSTUP_HOME);
  assert.equal(build.PATH, `${join(environment.CARGO_HOME, 'bin')};${environment.PATH}`);
  assert.deepEqual(environment, {
    LIFEOS_SIGNING_DIR: 'C:/private/signing',
    CARGO_HOME: 'C:/build/cargo',
    RUSTUP_HOME: 'C:/build/rustup',
    PATH: 'C:/node;C:/Windows/System32',
  });
});

test('retains the previous release computer folders as defaults', () => {
  const build = resolveWindowsBuildEnvironment({ PATH: 'existing' });
  assert.equal(resolveWindowsSigningDirectory({}), 'D:/Android/LifeOS/signing');
  assert.equal(build.CARGO_HOME, 'D:/Android/CargoHome');
  assert.equal(build.RUSTUP_HOME, 'D:/Android/RustupHome');
  assert.equal(build.PATH, `${join(build.CARGO_HOME, 'bin')};existing`);
});

test('preserves the mixed-case Windows Path variable', () => {
  const build = resolveWindowsBuildEnvironment({ CARGO_HOME: 'C:/cargo', Path: 'inherited' });
  assert.equal(build.Path, `${join('C:/cargo', 'bin')};inherited`);
  assert.equal(Object.hasOwn(build, 'PATH'), false);
});

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
