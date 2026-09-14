import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import process from 'node:process';
import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = join(root, 'node_modules', '.cache', 'lifeos-sync-roundtrip');
mkdirSync(directory, { recursive: true });
const cargo = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8');
const dependencies = [
  'serde',
  'serde_json',
  'base64',
  'chacha20poly1305',
  'hkdf',
  'rand_core',
  'sha2',
  'x25519-dalek',
  'zeroize',
].map((name) => {
  const line = cargo.split(/\r?\n/).find((line) => line.startsWith(`${name} =`));
  if (!line) throw new Error(`Missing existing crypto dependency: ${name}`);
  return line;
});
writeFileSync(
  join(directory, 'Cargo.toml'),
  [
    '[package]',
    'name = "lifeos-sync-roundtrip"',
    'version = "0.0.0"',
    'edition = "2021"',
    '[[bin]]',
    'name = "lifeos-sync-roundtrip"',
    `path = ${JSON.stringify(join(root, 'scripts/test-infrastructure/native-sync-roundtrip.rs').replaceAll('\\', '/'))}`,
    '[dependencies]',
    ...dependencies,
  ].join('\n'),
);
const env = { ...process.env, LIFEOS_NATIVE_ROUNDTRIP_DIR: directory };
const run = async (stage, command, args, phase, timeoutMs) => {
  const result = await runBoundedProcess({
    stage,
    command,
    args,
    cwd: root,
    env: { ...env, LIFEOS_NATIVE_ROUNDTRIP_PHASE: phase },
    timeoutMs,
    shutdownTimeoutMs: 10000,
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
};
const test = [
  'scripts/run-vitest.mjs',
  'target',
  'src/infrastructure/sync/pilot/V2EncryptedRoundTrip.test.ts',
];
await run('sync-crypto:serialize', process.execPath, test, 'prepare', 120000);
await run(
  'sync-crypto:native',
  'cargo',
  ['run', '--offline', '--quiet', '--manifest-path', join(directory, 'Cargo.toml')],
  'native',
  240000,
);
await run('sync-crypto:restore', process.execPath, test, 'verify', 120000);
