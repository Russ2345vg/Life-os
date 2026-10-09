import { createHash } from 'node:crypto';
import {
  readReleaseSyncEnvironment,
  validateReleaseSyncEnvironment,
  validateBuiltReleaseSync,
} from './release-sync-config.mjs';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_DIR = join(ROOT, 'src-tauri');
const SIGNING_DIR = resolveReleaseSigningDirectory(process.env);
const RELEASE_REPOSITORY = 'LifeOS-Releases';
const PACKAGE_ID = 'com.lifeos.desktop';

export function resolveReleaseSigningDirectory(environment) {
  return environment.LIFEOS_SIGNING_DIR ?? 'D:/Android/LifeOS/signing';
}

export function buildReleasePath(environment) {
  const inheritedPath =
    Object.entries(environment).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const releaseTools = [
    join(environment.CARGO_HOME ?? 'D:\\Android\\CargoHome', 'bin'),
    join(
      environment.RUSTUP_HOME ?? 'D:\\Android\\RustupHome',
      'toolchains',
      'stable-x86_64-pc-windows-msvc',
      'bin',
    ),
  ];
  return [...releaseTools, ...(inheritedPath === '' ? [] : [inheritedPath])].join(';');
}

export function validateReleaseVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Release version must use the X.Y.Z format.');
  }
  const [major, minor, patch] = version.split('.').map(Number);
  if (major > 2146 || minor > 999 || patch > 999) {
    throw new Error('Release version cannot be represented as an Android versionCode.');
  }
}

export function expectedAndroidVersionCode(version) {
  validateReleaseVersion(version);
  const [major, minor, patch] = version.split('.').map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
}

function releaseAssetUrl(owner, version, assetName) {
  return `https://github.com/${owner}/${RELEASE_REPOSITORY}/releases/download/v${version}/${assetName}`;
}

export function buildWindowsManifest({ owner, version, notes, pubDate, signature }) {
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'windows-x86_64': {
        signature,
        url: releaseAssetUrl(owner, version, `LifeOS_${version}_x64-setup.exe`),
      },
    },
  };
}

export function buildAndroidManifest({ owner, version, notes, sha256 }) {
  return {
    version,
    versionCode: expectedAndroidVersionCode(version),
    notes,
    apkUrl: releaseAssetUrl(owner, version, `LifeOS_${version}_android_release.apk`),
    sha256,
    packageId: PACKAGE_ID,
  };
}

export function buildReleaseConfig({ owner, publicKey }) {
  const endpoint = `https://github.com/${owner}/${RELEASE_REPOSITORY}/releases/latest/download/latest.json`;
  return {
    build: {
      beforeBuildCommand: '',
    },
    plugins: {
      updater: {
        pubkey: publicKey.trim(),
        endpoints: [endpoint],
        windows: { installMode: 'passive' },
      },
    },
  };
}

export function parseReleaseArguments(argv) {
  const options = {
    action: '',
    version: '',
    owner: process.env.LIFEOS_GITHUB_OWNER ?? '',
    notes: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--owner') options.owner = argv[++index] ?? '';
    else if (value === '--notes') options.notes = argv[++index] ?? '';
    else if (value.startsWith('--')) throw new Error(`Unknown release option: ${value}`);
    else if (options.action === '') options.action = value;
    else if (options.version === '') options.version = value;
    else throw new Error(`Unexpected release argument: ${value}`);
  }
  if (!['prepare', 'publish'].includes(options.action) || options.version === '')
    throw new Error(
      'Usage: npm run release:publish -- <prepare|publish> X.Y.Z --owner <OWNER> [--notes "..."]',
    );
  return options;
}

function validateOwner(owner) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('Pass the GitHub owner with --owner <OWNER> or LIFEOS_GITHUB_OWNER.');
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readSecretEnvironment(path) {
  if (!existsSync(path)) throw new Error(`Local signing configuration is missing: ${path}`);
  const values = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid local signing configuration: ${path}`);
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function run(command, args, options = {}) {
  if (command === 'npm.cmd') {
    if (args[0] !== 'run' || args[1] !== 'tauri' || args[2] !== '--')
      throw new Error('Unsupported npm release command.');
    command = process.execPath;
    args = [join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args.slice(3)];
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.${detail}`,
    );
  }
  return options.capture ? result.stdout.trim() : '';
}

function findFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) found.push(...findFiles(path, predicate));
    else if (predicate(path)) found.push(path);
  }
  return found;
}

export function selectAndroidApk(root) {
  const candidates = findFiles(root, (path) => /-release\.apk$/i.test(basename(path)));
  const apk = candidates.find((path) => /universal/i.test(basename(path))) ?? candidates[0];
  if (!apk) throw new Error('Android release APK was not produced.');
  return apk;
}

export function assertAndroidJniBridge(mapping) {
  if (!/\bgetPluginManager\(\).*->\s*getPluginManager\b/.test(mapping)) {
    throw new Error('Android release removed the Tauri getPluginManager JNI bridge.');
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function releaseAssetNames(version) {
  return [
    `LifeOS_${version}_x64-setup.exe`,
    `LifeOS_${version}_x64-setup.exe.sig`,
    `LifeOS_${version}_android_release.apk`,
    'latest.json',
    'android-latest.json',
    'SHA256SUMS.txt',
  ];
}

export function writePreparedRelease({ directory, owner, version, notes, commit, assets }) {
  const files = Object.fromEntries(assets.map((name) => [name, sha256(join(directory, name))]));
  writeFileSync(
    join(directory, 'prepared.json'),
    `${JSON.stringify({ owner, version, notes, commit, files }, null, 2)}\n`,
  );
}

export function loadPreparedRelease({ directory, owner, version, commit }) {
  const receiptPath = join(directory, 'prepared.json');
  if (!existsSync(receiptPath)) throw new Error('Prepared release is missing; run prepare first.');
  const receipt = readJson(receiptPath);
  if (receipt.owner !== owner) throw new Error('Prepared release owner mismatch.');
  if (receipt.version !== version) throw new Error('Prepared release version mismatch.');
  if (receipt.commit !== commit) throw new Error('Prepared release commit mismatch.');
  const names = releaseAssetNames(version);
  if (
    !receipt.files ||
    Object.keys(receipt.files).length !== names.length ||
    names.some((name) => !Object.hasOwn(receipt.files, name))
  )
    throw new Error('Prepared release is incomplete.');
  for (const name of names) {
    const path = join(directory, name);
    if (!existsSync(path) || sha256(path) !== receipt.files[name])
      throw new Error(`Prepared asset changed: ${name}`);
  }
  if (typeof receipt.notes !== 'string' || receipt.notes.trim() === '')
    throw new Error('Prepared release notes are missing.');
  return { notes: receipt.notes, assets: names.map((name) => join(directory, name)) };
}

function verifySourceVersions(version) {
  const packageMetadata = readJson(join(ROOT, 'package.json'));
  const cargo = readFileSync(join(TAURI_DIR, 'Cargo.toml'), 'utf8');
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (packageMetadata.version !== version || cargoVersion !== version) {
    throw new Error(
      `Version mismatch: package.json=${packageMetadata.version}, Cargo.toml=${cargoVersion}, requested=${version}.`,
    );
  }
}

function writeReleaseConfig(owner, publicKey) {
  const endpoint = `https://github.com/${owner}/${RELEASE_REPOSITORY}/releases/latest/download/latest.json`;
  const configPath = join(TAURI_DIR, 'tauri.release.conf.json');
  const config = buildReleaseConfig({
    owner,
    publicKey,
  });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { configPath, endpoint };
}

function prepareArtifacts({ owner, version, notes, commit }) {
  const syncEnvironment = readReleaseSyncEnvironment(ROOT);
  const syncConfiguration = validateReleaseSyncEnvironment(syncEnvironment);
  const secretPath = join(SIGNING_DIR, 'lifeos-updater.env');
  const publicKeyPath = join(SIGNING_DIR, 'lifeos-updater.key.pub');
  const androidProperties = join(TAURI_DIR, 'gen', 'android', 'keystore.properties');
  if (!existsSync(publicKeyPath))
    throw new Error(`Tauri updater public key is missing: ${publicKeyPath}`);
  if (!existsSync(androidProperties))
    throw new Error(`Android signing configuration is missing: ${androidProperties}`);
  const signingEnvironment = readSecretEnvironment(secretPath);
  const privateKeyPath = signingEnvironment.TAURI_SIGNING_PRIVATE_KEY_PATH;
  if (!privateKeyPath || !existsSync(privateKeyPath))
    throw new Error('Tauri updater private key is missing.');
  if (!signingEnvironment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
    throw new Error('Tauri updater key password is missing.');

  const publicKey = readFileSync(publicKeyPath, 'utf8');
  const { configPath, endpoint } = writeReleaseConfig(owner, publicKey);
  const androidEndpoint = `https://github.com/${owner}/${RELEASE_REPOSITORY}/releases/latest/download/android-latest.json`;
  const buildEnvironment = {
    ...process.env,
    ...signingEnvironment,
    ...syncEnvironment,
    CARGO_HOME: process.env.CARGO_HOME ?? 'D:\\Android\\CargoHome',
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? 'D:\\Android\\RustupHome',
    VITE_LIFEOS_ANDROID_UPDATE_ENDPOINT: androidEndpoint,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(privateKeyPath, 'utf8'),
  };
  for (const key of Object.keys(buildEnvironment)) {
    if (key.toLowerCase() === 'path') delete buildEnvironment[key];
  }
  buildEnvironment.PATH = buildReleasePath(process.env);

  run(process.execPath, [join(ROOT, 'scripts', 'run-check.mjs'), 'build'], {
    env: buildEnvironment,
  });
  validateBuiltReleaseSync(join(ROOT, 'dist'), syncConfiguration);

  run('npm.cmd', ['run', 'tauri', '--', 'build', '--config', configPath], {
    env: buildEnvironment,
  });
  run(
    'npm.cmd',
    ['run', 'tauri', '--', 'android', 'build', '--apk', '--ci', '--config', configPath],
    { env: buildEnvironment },
  );

  const nsisDirectory = join(TAURI_DIR, 'target', 'release', 'bundle', 'nsis');
  const installer = selectWindowsInstaller(nsisDirectory, version);
  const signature = `${installer}.sig`;
  if (!existsSync(signature)) throw new Error('Tauri updater signature was not produced.');

  const androidOutputs = join(TAURI_DIR, 'gen', 'android', 'app', 'build', 'outputs', 'apk');
  const sourceApk = selectAndroidApk(androidOutputs);
  const androidMapping = join(
    TAURI_DIR,
    'gen',
    'android',
    'app',
    'build',
    'outputs',
    'mapping',
    'universalRelease',
    'mapping.txt',
  );
  assertAndroidJniBridge(readFileSync(androidMapping, 'utf8'));

  const generatedProperties = join(TAURI_DIR, 'gen', 'android', 'app', 'tauri.properties');
  const properties = readFileSync(generatedProperties, 'utf8');
  const generatedVersionCode = Number(
    properties.match(/^tauri\.android\.versionCode=(\d+)$/m)?.[1],
  );
  if (generatedVersionCode !== expectedAndroidVersionCode(version)) {
    throw new Error(
      `Android versionCode mismatch: expected ${expectedAndroidVersionCode(version)}, got ${generatedVersionCode}.`,
    );
  }

  const outputDirectory = join(TAURI_DIR, 'target', 'release-channel', `v${version}`);
  mkdirSync(outputDirectory, { recursive: true });
  const installerOutput = join(outputDirectory, `LifeOS_${version}_x64-setup.exe`);
  const signatureOutput = `${installerOutput}.sig`;
  const apkOutput = join(outputDirectory, `LifeOS_${version}_android_release.apk`);
  copyFileSync(installer, installerOutput);
  copyFileSync(signature, signatureOutput);
  copyFileSync(sourceApk, apkOutput);

  const apkSha256 = sha256(apkOutput);
  const pubDate = new Date().toISOString();
  const latest = buildWindowsManifest({
    owner,
    version,
    notes,
    pubDate,
    signature: readFileSync(signatureOutput, 'utf8').trim(),
  });
  const androidLatest = buildAndroidManifest({ owner, version, notes, sha256: apkSha256 });
  const latestPath = join(outputDirectory, 'latest.json');
  const androidLatestPath = join(outputDirectory, 'android-latest.json');
  const checksumPath = join(outputDirectory, 'SHA256SUMS.txt');
  writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`);
  writeFileSync(androidLatestPath, `${JSON.stringify(androidLatest, null, 2)}\n`);
  writeFileSync(
    checksumPath,
    `${sha256(installerOutput)}  ${basename(installerOutput)}\n${apkSha256}  ${basename(apkOutput)}\n`,
  );
  const assets = releaseAssetNames(version);
  writePreparedRelease({ directory: outputDirectory, owner, version, notes, commit, assets });
  return {
    endpoint,
    androidEndpoint,
    outputDirectory,
    assets: assets.map((name) => join(outputDirectory, name)),
  };
}

export function selectWindowsInstaller(directory, version) {
  validateReleaseVersion(version);
  const installer = join(directory, `LifeOS_${version}_x64-setup.exe`);
  if (!existsSync(installer)) throw new Error(`Windows installer ${version} was not produced.`);
  return installer;
}

async function verifyPublicAssets(owner, assets) {
  for (const asset of assets) {
    const url = `https://github.com/${owner}/${RELEASE_REPOSITORY}/releases/latest/download/${basename(asset)}`;
    const response = await globalThis.fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok)
      throw new Error(`Published asset is unavailable (${response.status}): ${url}`);
    await response.body?.cancel();
  }
}

async function main() {
  const options = parseReleaseArguments(process.argv.slice(2));
  validateReleaseVersion(options.version);
  verifySourceVersions(options.version);
  const commit = run('git', ['rev-parse', 'HEAD'], { capture: true });

  validateOwner(options.owner);

  const directory = join(TAURI_DIR, 'target', 'release-channel', `v${options.version}`);
  if (options.action === 'prepare') {
    const notes =
      options.notes.trim() || `LifeOS ${options.version}: стабильное обновление приложения.`;
    const prepared = prepareArtifacts({
      owner: options.owner,
      version: options.version,
      notes,
      commit,
    });
    console.log(`Release assets prepared: ${prepared.outputDirectory}`);
    return;
  }
  const prepared = loadPreparedRelease({
    directory,
    owner: options.owner,
    version: options.version,
    commit,
  });
  if (options.notes.trim() && options.notes.trim() !== prepared.notes)
    throw new Error('Release notes differ from the prepared release.');
  const notes = prepared.notes;
  run('gh', ['--version'], { capture: true });
  run('gh', ['auth', 'status'], { capture: true });

  const repository = `${options.owner}/${RELEASE_REPOSITORY}`;
  const view = spawnSync('gh', ['repo', 'view', repository, '--json', 'url'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (view.status !== 0) {
    run('gh', [
      'repo',
      'create',
      repository,
      '--public',
      '--description',
      'Signed LifeOS release artifacts only',
      '--disable-issues',
      '--disable-wiki',
    ]);
    run('gh', [
      'api',
      `repos/${repository}/contents/README.md`,
      '--method',
      'PUT',
      '-f',
      'message=Initialize signed release channel',
      '-f',
      `content=${Buffer.from('# LifeOS Releases\n\nSigned LifeOS application releases.\n').toString('base64')}`,
    ]);
  }
  const existingRelease = spawnSync(
    'gh',
    ['release', 'view', `v${options.version}`, '--repo', repository],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
  if (existingRelease.status === 0)
    throw new Error(`Release v${options.version} already exists; refusing to overwrite it.`);
  run('gh', [
    'release',
    'create',
    `v${options.version}`,
    ...prepared.assets,
    '--repo',
    repository,
    '--title',
    `LifeOS ${options.version}`,
    '--notes',
    notes,
    '--latest',
  ]);
  await verifyPublicAssets(options.owner, prepared.assets);
  console.log(`Published https://github.com/${repository}/releases/tag/v${options.version}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(
      `REL-05 release failed closed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
