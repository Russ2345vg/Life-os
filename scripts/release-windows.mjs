import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { runBoundedProcess } from './test-infrastructure/process-runner.mjs';
import {
  readReleaseSyncEnvironment,
  validateReleaseSyncEnvironment,
  validateBuiltReleaseSync,
  validateReleaseSyncProof,
} from './release-sync-config.mjs';
import {
  buildWindowsManifest,
  selectWindowsInstaller,
  validateReleaseVersion,
} from './release-publish.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'Russ2345vg/LifeOS-Releases';
const SIGNING = resolveWindowsSigningDirectory(process.env);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function resolveWindowsSigningDirectory(environment) {
  return environment.LIFEOS_SIGNING_DIR ?? 'D:/Android/LifeOS/signing';
}

export function resolveWindowsBuildEnvironment(environment) {
  const cargoHome = environment.CARGO_HOME ?? 'D:/Android/CargoHome';
  const rustupHome = environment.RUSTUP_HOME ?? 'D:/Android/RustupHome';
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  return {
    ...environment,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    [pathKey]: `${join(cargoHome, 'bin')};${environment[pathKey] ?? ''}`,
  };
}

export function validatePreparedRelease(receipt, version, hashFile) {
  if (receipt.version !== version) throw new Error('Prepared version mismatch.');
  if (!receipt.files || Object.keys(receipt.files).length === 0)
    throw new Error('Prepared release is empty.');
  for (const [name, hash] of Object.entries(receipt.files)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..')
      throw new Error('Unsafe asset name.');
    if (hashFile(name) !== hash) throw new Error(`Prepared asset changed: ${name}`);
  }
  validateReleaseSyncProof(receipt.syncConfiguration);
}

export function preserveAndroidManifest(manifest) {
  if (!manifest.apkUrl?.startsWith(`https://github.com/${REPOSITORY}/releases/download/`))
    throw new Error('Previous Android manifest must reference an immutable APK.');
  return manifest;
}

async function prepare(version, directory) {
  const syncEnvironment = readReleaseSyncEnvironment(ROOT);
  const syncConfiguration = validateReleaseSyncEnvironment(syncEnvironment);
  const cargo = readFileSync(join(ROOT, 'src-tauri/Cargo.toml'), 'utf8');
  if (
    readJson(join(ROOT, 'package.json')).version !== version ||
    cargo.match(/^version = "([^"]+)"/m)?.[1] !== version
  )
    throw new Error('Set matching versions in package.json and Cargo.toml before preparation.');
  const values = {};
  for (const line of readFileSync(join(SIGNING, 'lifeos-updater.env'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('Invalid signing configuration.');
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  const config = readJson(join(ROOT, 'src-tauri/tauri.conf.json'));
  if (
    config.plugins.updater.pubkey !==
    readFileSync(join(SIGNING, 'lifeos-updater.key.pub'), 'utf8').trim()
  )
    throw new Error('Updater public key mismatch.');
  if (
    !config.plugins.updater.endpoints.includes(
      `https://github.com/${REPOSITORY}/releases/latest/download/latest.json`,
    )
  )
    throw new Error('Windows update endpoint is missing.');
  const startedAt = Date.now();
  const build = await runBoundedProcess({
    stage: 'release:windows',
    command: process.execPath,
    args: [
      join(ROOT, 'node_modules/@tauri-apps/cli/tauri.js'),
      'build',
      '--ci',
      '--bundles',
      'nsis',
    ],
    cwd: ROOT,
    timeoutMs: 900_000,
    env: {
      ...resolveWindowsBuildEnvironment(process.env),
      ...syncEnvironment,
      TAURI_SIGNING_PRIVATE_KEY: readFileSync(values.TAURI_SIGNING_PRIVATE_KEY_PATH, 'utf8'),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: values.TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
    },
  });
  if (build.exitCode !== 0) throw new Error(`Windows build failed: ${build.exitCode}`);
  validateBuiltReleaseSync(join(ROOT, 'dist'), syncConfiguration);
  const installer = selectWindowsInstaller(
    join(ROOT, 'src-tauri/target/release/bundle/nsis'),
    version,
  );
  for (const file of [installer, `${installer}.sig`]) {
    if (!existsSync(file) || statSync(file).mtimeMs < startedAt - 2000)
      throw new Error('A fresh signed installer was not produced.');
  }
  mkdirSync(directory, { recursive: true });
  for (const file of [installer, `${installer}.sig`])
    copyFileSync(file, join(directory, basename(file)));
  const manifest = buildWindowsManifest({
    owner: 'Russ2345vg',
    version,
    notes: `LifeOS ${version}: обновление приложения.`,
    pubDate: new Date().toISOString(),
    signature: readFileSync(`${installer}.sig`, 'utf8').trim(),
  });
  writeFileSync(join(directory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const assets = [basename(installer), `${basename(installer)}.sig`, 'latest.json'];
  writeFileSync(
    join(directory, 'SHA256SUMS.txt'),
    assets.map((name) => `${digest(join(directory, name))}  ${name}\n`).join(''),
  );
  assets.push('SHA256SUMS.txt');
  writeFileSync(
    join(directory, 'prepared.json'),
    `${JSON.stringify({ version, syncConfiguration, files: Object.fromEntries(assets.map((name) => [name, digest(join(directory, name))])) }, null, 2)}\n`,
  );
  console.log(`Prepared Windows release: ${directory}`);
}

function gh(args) {
  const result = spawnSync('gh', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error) throw new Error(`GitHub CLI is unavailable: ${result.error.code}`);
  if (result.status !== 0) throw new Error(result.stderr || 'GitHub command failed.');
  return result.stdout.trim();
}

async function publish(version, directory) {
  const receipt = readJson(join(directory, 'prepared.json'));
  validatePreparedRelease(receipt, version, (name) => digest(join(directory, name)));
  const required = [
    `LifeOS_${version}_x64-setup.exe`,
    `LifeOS_${version}_x64-setup.exe.sig`,
    'latest.json',
    'SHA256SUMS.txt',
  ];
  if (required.some((name) => !Object.hasOwn(receipt.files, name)))
    throw new Error('Prepared release is incomplete.');
  gh(['auth', 'status']);
  // Query the release list so an empty channel is distinct from a network/auth failure.
  const releases = JSON.parse(gh(['api', `repos/${REPOSITORY}/releases?per_page=100`]));
  if (releases.some((release) => release.tag_name === `v${version}`))
    throw new Error('This version already exists; refusing to overwrite it.');
  const assets = required.map((name) => join(directory, name));
  const publicReleases = releases.filter((release) => !release.draft && !release.prerelease);
  if (publicReleases.length) {
    const latest = JSON.parse(gh(['api', `repos/${REPOSITORY}/releases/latest`]));
    const android = latest.assets.find((asset) => asset.name === 'android-latest.json');
    if (android) {
      const response = await globalThis.fetch(android.browser_download_url, {
        signal: globalThis.AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('Cannot preserve the Android update feed.');
      const manifest = preserveAndroidManifest(await response.json());
      const path = join(directory, 'android-latest.json');
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      assets.push(path);
    }
  }
  gh([
    'release',
    'create',
    `v${version}`,
    ...assets,
    '--repo',
    REPOSITORY,
    '--draft',
    '--title',
    `LifeOS ${version}`,
    '--notes',
    `LifeOS ${version}: обновление Windows с автоматической проверкой новых версий.`,
  ]);
  const draft = JSON.parse(
    gh(['release', 'view', `v${version}`, '--repo', REPOSITORY, '--json', 'assets']),
  );
  for (const file of assets) {
    if (
      !draft.assets.some(
        (asset) => asset.name === basename(file) && asset.size === statSync(file).size,
      )
    )
      throw new Error('Draft assets are incomplete; release remains unpublished.');
  }
  gh(['release', 'edit', `v${version}`, '--repo', REPOSITORY, '--draft=false', '--latest']);
  console.log(`Published https://github.com/${REPOSITORY}/releases/tag/v${version}`);
}

async function main() {
  const [action, version, ...extra] = process.argv.slice(2);
  if (action === 'check' && version === undefined) {
    validateReleaseSyncEnvironment(readReleaseSyncEnvironment(ROOT));
    console.log('Production sync configuration: PASS; accounts enabled.');
    return;
  }
  if (!['prepare', 'publish'].includes(action) || !version || extra.length)
    throw new Error('Usage: npm run release:windows -- check | <prepare|publish> X.Y.Z');
  validateReleaseVersion(version);
  const directory = join(ROOT, 'src-tauri/target/release-channel', `v${version}`, 'windows');
  if (action === 'prepare') await prepare(version, directory);
  else await publish(version, directory);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
