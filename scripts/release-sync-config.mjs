import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { loadEnv } from 'vite';
import ts from 'typescript';

const required = [
  'VITE_LIFEOS_SUPABASE_URL',
  'VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY',
  'VITE_LIFEOS_ACCOUNT_SYNC_ENABLED',
];

export function readReleaseSyncEnvironment(root, environment = process.env) {
  const fileValues = loadEnv('production', root, 'VITE_LIFEOS_');
  return Object.fromEntries(
    [...required, 'VITE_LIFEOS_OPENAI_ENABLED'].map((name) => [
      name,
      environment[name] ?? fileValues[name],
    ]),
  );
}

export function validateReleaseSyncEnvironment(environment) {
  const urlValue = environment?.VITE_LIFEOS_SUPABASE_URL;
  const key = environment?.VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY;
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw configurationError('VITE_LIFEOS_SUPABASE_URL is missing or invalid');
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.supabase.co') ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw configurationError('a managed production Supabase URL is required');
  if (!isPublicKey(key)) {
    throw configurationError('VITE_LIFEOS_SUPABASE_PUBLISHABLE_KEY must be a public client key');
  }
  if (environment.VITE_LIFEOS_ACCOUNT_SYNC_ENABLED !== 'true') {
    throw configurationError('VITE_LIFEOS_ACCOUNT_SYNC_ENABLED must be true');
  }
  return {
    projectUrl: url.origin,
    publishableKeySha256: createHash('sha256').update(key).digest('hex'),
    accountSyncEnabled: true,
  };
}

export function validateReleaseSyncProof(proof) {
  let url;
  try {
    url = new URL(proof?.projectUrl);
  } catch {
    /* checked below */
  }
  if (
    !url ||
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.supabase.co') ||
    proof.projectUrl !== url.origin ||
    proof.accountSyncEnabled !== true ||
    !/^[a-f0-9]{64}$/.test(proof.publishableKeySha256 ?? '')
  )
    throw configurationError('prepared package has no verified production sync configuration');
}

export function extractBuiltSyncEnvironment(source) {
  const ast = ts.createSourceFile(
    'bundle.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const matches = [];
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === 'syncEnvironment' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const properties = node.initializer.properties.filter(ts.isPropertyAssignment);
      if (
        required.every((name) =>
          properties.some((property) => propertyName(property.name) === name),
        )
      ) {
        matches.push(
          Object.fromEntries(
            properties.map((property) => [
              propertyName(property.name),
              literalValue(property.initializer),
            ]),
          ),
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (matches.length > 1) throw configurationError('multiple production sync factories found');
  return matches[0] ?? null;
}

export function validateBuiltReleaseSync(dist, expected) {
  const environments = [];
  for (const file of readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(join(dist, 'assets', file), 'utf8');
    if (!source.includes('VITE_LIFEOS_SUPABASE_URL')) continue;
    const environment = extractBuiltSyncEnvironment(source);
    if (environment !== null) environments.push(environment);
  }
  if (environments.length !== 1)
    throw configurationError('exactly one built sync factory is required');
  const actual = validateReleaseSyncEnvironment(environments[0]);
  if (
    actual.projectUrl !== expected.projectUrl ||
    actual.publishableKeySha256 !== expected.publishableKeySha256 ||
    actual.accountSyncEnabled !== expected.accountSyncEnabled
  )
    throw configurationError('built sync configuration differs from the checked environment');
  return actual;
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : '';
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  // Missing Vite variables become void 0. Dynamic values fail validation as well.
  return undefined;
}

function isPublicKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) return true;
  const segments = value.split('.');
  if (segments.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')).role === 'anon';
  } catch {
    return false;
  }
}

function configurationError(reason) {
  // Include variable names and reasons, never their values.
  return new Error(`Release sync configuration: ${reason}.`);
}
