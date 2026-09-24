import { createHash } from 'node:crypto';
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
const SIGNING_DIR = 'D:\\Android\\LifeOS\\signing';
const RELEASE_REPOSITORY = 'LifeOS-Releases';
const PACKAGE_ID = 'com.lifeos.desktop';

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

function parseArguments(argv) {
  const options = {
    version: '',
    owner: process.env.LIFEOS_GITHUB_OWNER ?? '',
    notes: '',
    prepareOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--owner') options.owner = argv[++index] ?? '';
    else if (value === '--notes') options.notes = argv[++index] ?? '';
    else if (value === '--prepare-only') options.prepareOnly = true;
    else if (value.startsWith('--')) throw new Error(`Unknown release option: ${value}`);
    else if (options.version === '') options.version = value;
    else throw new Error(`Unexpected release argument: ${value}`);
  }
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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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
  writeFileSync(
    configPath,
    `${JSON.stringify({ plugins: { updater: { pubkey: publicKey.trim(), endpoints: [endpoint], windows: { installMode: 'passive' } } } }, null, 2)}\n`,
  );
  return { configPath, endpoint };
}

function prepareArtifacts({ owner, version, notes }) {
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
    CARGO_HOME: process.env.CARGO_HOME ?? 'D:\\Android\\CargoHome',
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? 'D:\\Android\\RustupHome',
    VITE_LIFEOS_ANDROID_UPDATE_ENDPOINT: androidEndpoint,
    TAURI_SIGNING_PRIVATE_KEY: readFileSync(privateKeyPath, 'utf8'),
  };
  buildEnvironment.PATH = `D:\\Android\\CargoHome\\bin;D:\\Android\\RustupHome\\toolchains\\stable-x86_64-pc-windows-msvc\\bin;${buildEnvironment.PATH}`;

  run('npm.cmd', ['run', 'tauri', '--', 'build', '--config', configPath], {
    env: buildEnvironment,
  });
  run('npm.cmd', ['run', 'tauri', '--', 'android', 'build', '--apk', '--ci'], {
    env: buildEnvironment,
  });

  const nsisDirectory = join(TAURI_DIR, 'target', 'release', 'bundle', 'nsis');
  const installer = selectWindowsInstaller(nsisDirectory, version);
  const signature = `${installer}.sig`;
  if (!existsSync(signature)) throw new Error('Tauri updater signature was not produced.');

  const androidOutputs = join(TAURI_DIR, 'gen', 'android', 'app', 'build', 'outputs', 'apk');
  const apkCandidates = findFiles(androidOutputs, (path) => /release.*\.apk$/i.test(path));
  const sourceApk = apkCandidates.find((path) => /universal/i.test(path)) ?? apkCandidates[0];
  if (!sourceApk) throw new Error('Android release APK was not produced.');

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
  return {
    endpoint,
    androidEndpoint,
    outputDirectory,
    assets: [
      installerOutput,
      signatureOutput,
      apkOutput,
      latestPath,
      androidLatestPath,
      checksumPath,
    ],
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
  const options = parseArguments(process.argv.slice(2));
  if (options.version === '')
    throw new Error(
      'Usage: npm run release:publish -- X.Y.Z --owner <OWNER> [--notes "..."] [--prepare-only]',
    );
  validateReleaseVersion(options.version);
  verifySourceVersions(options.version);
  const notes =
    options.notes.trim() || `LifeOS ${options.version}: стабильное обновление приложения.`;

  if (!options.prepareOnly) {
    run('gh', ['--version'], { capture: true });
    run('gh', ['auth', 'status'], { capture: true });
    if (options.owner === '') {
      options.owner = run('gh', ['api', 'user', '--jq', '.login'], { capture: true });
    }
  }
  validateOwner(options.owner);

  const prepared = prepareArtifacts({ owner: options.owner, version: options.version, notes });
  if (options.prepareOnly) {
    console.log(`Release assets prepared: ${prepared.outputDirectory}`);
    return;
  }

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
