import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'wxt';

/**
 * WXT loads `.env` files for the bundler (`import.meta.env`) but not into
 * `process.env` before this config file is evaluated. These build-time values
 * therefore need a small reader of their own so `.env` behaves as documented.
 * Real process env always wins over file values.
 */
function envValue(name: string): string | undefined {
  if (process.env[name]) return process.env[name];

  const files = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.production',
    '.env.production.local',
  ];
  const values: Record<string, string> = {};
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      Object.assign(values, parseEnv(readFileSync(file, 'utf8')));
    } catch {
      // Ignore malformed env files; WXT will report them separately.
    }
  }
  return values[name] || undefined;
}

/**
 * Pinned extension ID.
 *
 * Chrome derives an unpacked extension's ID from its install path, so every
 * developer/install would otherwise get a different ID and any Google Cloud
 * OAuth client registered for one ID would reject the others. Pinning a public
 * `manifest.key` makes the ID stable for everyone. This is the base64-encoded
 * DER SubjectPublicKeyInfo of a 2048-bit RSA key; the matching private key is
 * NOT in the repo (generate your own and override via WXT_EXTENSION_KEY).
 *
 * Compute the resulting ID with `npm run extension:id` after a build.
 */
const DEFAULT_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuINIkdd5xvG8G2s1GqqyE7T906z1G6N/U8NPNGNoir5udaRJ4C7uBSA2+j9w1zYtg6mXTegrDkdxe+1kz3ipxwvXlzFpXLx1NIyFnFl8d5Q7qkubR+IGrgrX5631hXXjvh1Ydcnp8s4bQOk916SC7HgR60wpHtY/vBURBIj1J14AV94PQYys9iyqtGjjPANHWSrFj7Z4TYLyYEd8DyUet1G+OlJ0aFfcxTs8eaowT0CxgPh8OAM48/tI2WGh6M9U7sjygTmyTuOR2/DyUBwn022DSituT/93dyeM9UBdg8l6bJdgVWF8lA6jeMBfmN9wPPxgrSw4E0dHrYn4hJ5xxQIDAQAB';

const extensionKey = envValue('WXT_EXTENSION_KEY') || DEFAULT_EXTENSION_KEY;

const googleClientId =
  envValue('WXT_GOOGLE_CLIENT_ID') ||
  '98831444529-vea88qlt53hm8m53mgnt67msqgb8gcul.apps.googleusercontent.com';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: '../entrypoints',
  manifest: {
    name: 'Jarvis Sync',
    key: extensionKey,
    // `identity.email` is required for chrome.identity.getProfileUserInfo() to
    // return the signed-in address shown as "Authorized as …" in the popup.
    permissions: ['identity', 'identity.email', 'storage'],
    oauth2: {
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      client_id: googleClientId,
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    host_permissions: [
      'https://www.linkedin.com/*',
      'https://crm.zoho.com/*',
      'https://gmail.googleapis.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
  },
});
