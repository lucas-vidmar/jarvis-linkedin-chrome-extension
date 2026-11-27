#!/usr/bin/env node
/**
 * Prints the deterministic Chrome extension ID for the built extension.
 *
 * Chrome computes an extension's ID from the SHA-256 of the DER-encoded public
 * key in the manifest's `key` field: take the first 16 bytes of the digest and
 * map each hex nibble 0-9a-f to a-p. Because the key is pinned in
 * `wxt.config.ts`, every build produces the same ID, which is what a Google
 * Cloud OAuth client must be registered against.
 *
 * Usage:
 *   npm run build && npm run extension:id
 *   node scripts/extension-id.mjs [path/to/manifest.json]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(process.argv[2] ?? '.output/chrome-mv3/manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`Could not read ${manifestPath}. Run "npm run build" first.`);
  console.error(`  ${error.message}`);
  process.exit(1);
}

const key = typeof manifest.key === 'string' ? manifest.key.replace(/\s+/g, '') : '';
if (key.length === 0) {
  console.error(`No "key" field in ${manifestPath}. Set manifest.key in wxt.config.ts.`);
  process.exit(1);
}

const der = Buffer.from(key, 'base64');
if (der.length === 0) {
  console.error('manifest.key is not valid base64.');
  process.exit(1);
}

const digest = createHash('sha256').update(der).digest();
const hex = digest.subarray(0, 16).toString('hex');
const extensionId = hex.replace(/[0-9a-f]/g, (nibble) =>
  String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(nibble, 16)),
);

console.log(extensionId);
