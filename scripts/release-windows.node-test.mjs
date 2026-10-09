import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import {
  validatePreparedRelease,
  preserveAndroidManifest,
  resolveWindowsBuildEnvironment,
  resolveWindowsSigningDirectory,
} from './release-windows.mjs';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  extractBuiltSyncEnvironment,
  validateReleaseSyncEnvironment,
  validateBuiltReleaseSync,
} from './release-sync-config.mjs';

const publicEnvironment = {
  VITE_LIFEOS_SUPABASE_URL: 'https://example.supabase.co',
  VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic-release-test',
  VITE_LIFEOS_ACCOUNT_SYNC_ENABLED: 'true',
};

test('the real prepare command stops at configuration before touching signing or compilation', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./release-windows.mjs', import.meta.url)), 'prepare', '1.0.37'],
    {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      env: {
        ...process.env,
        VITE_LIFEOS_SUPABASE_URL: '',
        LIFEOS_SIGNING_DIR: join(tmpdir(), 'lifeos-nonexistent-signing-config'),
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release sync configuration/);
  assert.doesNotMatch(result.stderr, /ENOENT|private key|Windows build failed/i);
  assert.doesNotMatch(result.stdout, /release:windows.*START/);
});

test('blocks a release without sync settings or enabled accounts before building', () => {
  for (const environment of [
    {},
    { ...publicEnvironment, VITE_LIFEOS_SUPABASE_URL: '' },
    { ...publicEnvironment, VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: '' },
    { ...publicEnvironment, VITE_LIFEOS_ACCOUNT_SYNC_ENABLED: 'false' },
  ]) {
    assert.throws(() => validateReleaseSyncEnvironment(environment), /release sync configuration/i);
  }
  assert.equal(validateReleaseSyncEnvironment(publicEnvironment).accountSyncEnabled, true);
});

test('rejects server secrets and a local test server in a public release', () => {
  const elevated = `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_do-not-ship-this-value', elevated]) {
    assert.throws(
      () =>
        validateReleaseSyncEnvironment({
          ...publicEnvironment,
          VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      /release sync configuration/i,
    );
  }
  assert.throws(
    () =>
      validateReleaseSyncEnvironment({
        ...publicEnvironment,
        VITE_LIFEOS_SUPABASE_URL: 'http://localhost:54321',
      }),
    /release sync configuration/i,
  );
});

test('refuses a stale production bundle or one compiled for a different project', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lifeos-release-config-'));
  const assets = join(directory, 'assets');
  const bundle = join(assets, 'app.js');
  mkdirSync(assets);
  const expected = validateReleaseSyncEnvironment(publicEnvironment);
  const write = (environment) =>
    writeFileSync(bundle, `start({syncEnvironment:${JSON.stringify(environment)}})`);
  try {
    write(publicEnvironment);
    assert.deepEqual(validateBuiltReleaseSync(directory, expected), expected);
    write({ ...publicEnvironment, VITE_LIFEOS_SUPABASE_URL: 'https://different.supabase.co' });
    assert.throws(() => validateBuiltReleaseSync(directory, expected), /differs/i);
    write({
      ...publicEnvironment,
      VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_different-client-key',
    });
    assert.throws(() => validateBuiltReleaseSync(directory, expected), /differs/i);
    write({ ...publicEnvironment, VITE_LIFEOS_ACCOUNT_SYNC_ENABLED: 'false' });
    assert.throws(() => validateBuiltReleaseSync(directory, expected), /must be true/i);
    writeFileSync(bundle, 'const unrelated = 1;');
    assert.throws(() => validateBuiltReleaseSync(directory, expected), /exactly one/i);
  } finally {
    unlinkSync(bundle);
    rmdirSync(assets);
    rmdirSync(directory);
  }
});

test('checks the environment actually embedded in the production factory', () => {
  const missing =
    'createLifeOsApplication({syncEnvironment:{VITE_LIFEOS_SUPABASE_URL:void 0,VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY:void 0,VITE_LIFEOS_ACCOUNT_SYNC_ENABLED:void 0}})';
  assert.throws(
    () => validateReleaseSyncEnvironment(extractBuiltSyncEnvironment(missing)),
    /release sync configuration/i,
  );
  const configured = `createLifeOsApplication({syncEnvironment:${JSON.stringify(publicEnvironment)}})`;
  assert.deepEqual(extractBuiltSyncEnvironment(configured), publicEnvironment);
  const template = configured.replace(
    /:("[^"]*")/g,
    (_, literal) => ':' + '`' + JSON.parse(literal) + '`',
  );
  assert.deepEqual(extractBuiltSyncEnvironment(template), publicEnvironment);
  assert.equal(extractBuiltSyncEnvironment('const unrelated = 1;'), null);
  assert.throws(() => extractBuiltSyncEnvironment(configured + ';' + configured), /multiple/i);
});

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
  const receipt = {
    version: '1.0.14',
    syncConfiguration: validateReleaseSyncEnvironment(publicEnvironment),
    files: { 'latest.json': 'abc', 'installer.exe': 'def' },
  };
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
  assert.throws(
    () =>
      validatePreparedRelease(
        { ...receipt, syncConfiguration: undefined },
        '1.0.14',
        (name) => receipt.files[name],
      ),
    /configuration/i,
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
