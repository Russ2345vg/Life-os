// Explicitly authorized hosted acceptance. Uses isolated synthetic identities/spaces only.
// Tokens and fixture encryption keys stay in memory. No real profile, keys or records are read.
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { Buffer, Blob } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import { randomUUID, randomBytes, createCipheriv } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const { fetch, AbortSignal } = globalThis;

const deadline = setTimeout(() => {
  console.error('SYNC05 HTTP deadline exceeded');
  process.exit(124);
}, 600_000);
const input = createInterface({ input: process.stdin, output: process.stdout });
const env = fs.readFileSync('.env', 'utf8');
const config = Object.fromEntries(
  [...env.matchAll(/^(VITE_LIFEOS_SUPABASE_(?:URL|PUBLISHABLE_KEY))=(.*)$/gm)].map((m) => [
    m[1],
    m[2].trim().replace(/^['"]|['"]$/g, ''),
  ]),
);
const url = config.VITE_LIFEOS_SUPABASE_URL;
if (url !== 'https://oytsyvmlkngsmpevbbct.supabase.co')
  throw new Error('Unexpected linked project');
const key = config.VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY;
if (!key?.startsWith('sb_publishable_')) throw new Error('Publishable key required');
const evidence = { runId: randomUUID(), spaces: [], identities: [], objects: [], checks: [] };
const evidencePath = 'test-results/sync05-http-evidence.json';
const save = () => fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
const pass = (name) => {
  evidence.checks.push(name);
  save();
  console.log(`PASS ${name}`);
};
const hex = (size) => randomBytes(size).toString('hex');
async function identity() {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (p, i) => fetch(p, { ...i, signal: AbortSignal.timeout(20_000) }) },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user?.is_anonymous)
    throw new Error(`Anonymous synthetic identity failed: ${error?.code ?? 'invalid identity'}`);
  evidence.identities.push(data.user.id);
  save();
  return { client, userId: data.user.id };
}
async function space(actor) {
  const spaceId = randomUUID();
  const deviceId = randomUUID();
  const { error } = await actor.client.rpc('lifeos_sync_create_first_space', {
    p_space_id: spaceId,
    p_device_id: deviceId,
    p_public_key_hex: hex(32),
    p_device_name_ciphertext_hex: hex(32),
    p_device_name_nonce_hex: hex(24),
    p_platform: 'windows',
    p_recovery_auth_verifier_hex: hex(32),
    p_recovery_envelope_ciphertext_hex: hex(32),
    p_recovery_envelope_nonce_hex: hex(24),
  });
  if (error) throw new Error(`Synthetic space failed: ${error.code}`);
  evidence.spaces.push({ spaceId, deviceId, userId: actor.userId });
  save();
  return spaceId;
}
function encryptedFixture() {
  // Standard-library encrypted bytes test Storage only; production XChaCha is tested natively.
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', randomBytes(32), nonce);
  const ciphertext = Buffer.concat([
    cipher.update('SYNC05 synthetic Storage fixture'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return JSON.stringify({
    metadata: { testOnly: true },
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}
async function denial(client, bucket, path, label) {
  const segments = path.split('/');
  const newPath = `${segments[0]}/${randomUUID()}/1`;
  const upload = await client.storage.from(bucket).upload(newPath, new Blob([encryptedFixture()]), {
    upsert: false,
    contentType: 'application/octet-stream',
  });
  if (!upload.error) throw new Error(`${label}: unexpected upload permission`);
  const download = await client.storage.from(bucket).download(path);
  if (!download.error || download.data) throw new Error(`${label}: unexpected read permission`);
  pass(`${label}: upload and download denied in ${bucket}`);
}
try {
  const active = await identity();
  const spaceId = await space(active);
  const foreign = await identity();
  await space(foreign);
  for (const bucket of ['lifeos-attachments', 'lifeos-snapshots']) {
    const path = `${spaceId}/${randomUUID()}/1`;
    const bytes = encryptedFixture();
    const file = active.client.storage.from(bucket);
    const uploaded = await file.upload(path, new Blob([bytes]), {
      upsert: false,
      contentType: 'application/octet-stream',
    });
    if (uploaded.error) throw new Error(`Active upload failed: ${uploaded.error.message}`);
    evidence.objects.push({ bucket, path, bytes: Buffer.byteLength(bytes) });
    save();
    const downloaded = await file.download(path);
    if (downloaded.error || (await downloaded.data.text()) !== bytes)
      throw new Error('Ciphertext roundtrip mismatch');
    pass(`active ciphertext upload/download exact bytes in ${bucket}`);
    const duplicate = await file.upload(path, new Blob([encryptedFixture()]), { upsert: false });
    if (!duplicate.error) throw new Error('Immutable duplicate accepted');
    if ((await (await file.download(path)).data.text()) !== bytes)
      throw new Error('Immutable bytes changed');
    pass(`immutable duplicate rejected in ${bucket}`);
    const overwrite = await file.upload(path, new Blob([encryptedFixture()]), { upsert: true });
    if (!overwrite.error) throw new Error('Immutable overwrite accepted');
    await file.remove([path]);
    const retained = await file.download(path);
    if (retained.error || (await retained.data.text()) !== bytes)
      throw new Error('Protected object changed or deleted');
    pass(`overwrite and deletion cannot change retained bytes in ${bucket}`);
    await denial(foreign.client, bucket, path, 'foreign');
    const unauthenticated = await fetch(`${url}/storage/v1/object/public/${bucket}/${path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (unauthenticated.ok) throw new Error('Private object exposed by public URL');
    pass(`public URL denied in ${bucket}`);
    const plaintextPath = await file.upload(`${spaceId}/secret-filename.png/1`, new Blob([bytes]), {
      upsert: false,
    });
    if (!plaintextPath.error) throw new Error('Plaintext path accepted');
    pass(`plaintext filename path denied in ${bucket}`);
  }
  const pending = await identity();
  const pendingDeviceId = randomUUID();
  evidence.pending = { userId: pending.userId, deviceId: pendingDeviceId, spaceId };
  save();
  fs.writeFileSync(
    'test-results/sync05-http-pending.sql',
    `begin;\ninsert into public.devices(device_id,space_id,supabase_auth_user_id,public_key,platform,status) values ('${pendingDeviceId}','${spaceId}','${pending.userId}',decode('${hex(32)}','hex'),'android','pending');\ncommit;\n`,
  );
  await input.question('WAIT: apply sync05-http-pending.sql, then enter continue\n');
  for (const { bucket, path } of evidence.objects)
    await denial(pending.client, bucket, path, 'pending');
  fs.writeFileSync(
    'test-results/sync05-http-revoked.sql',
    `begin;\nupdate public.devices set status='revoked', activated_at=now(), revoked_at=now(),device_name_ciphertext=decode('${hex(32)}','hex'),device_name_nonce=decode('${hex(24)}','hex'),device_name_key_epoch=1 where device_id='${pendingDeviceId}' and space_id='${spaceId}' and supabase_auth_user_id='${pending.userId}' and status='pending';\ncommit;\n`,
  );
  await input.question('WAIT: apply sync05-http-revoked.sql, then enter continue\n');
  for (const { bucket, path } of evidence.objects)
    await denial(pending.client, bucket, path, 'revoked');
  pass('HOSTED STORAGE HTTP ACCEPTANCE COMPLETE');
  console.log('Synthetic ciphertext objects retained; no real user data used or changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  input.close();
}
