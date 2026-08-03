import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve('.output/chrome-mv3/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const failures = [];

if (manifest.manifest_version !== 3) {
  failures.push(`manifest_version is ${manifest.manifest_version}, expected 3`);
}

if (!manifest.oauth2?.scopes?.includes('https://www.googleapis.com/auth/gmail.send')) {
  failures.push(
    `oauth2.scopes must include the full URI https://www.googleapis.com/auth/gmail.send (shorthand "gmail.send" is rejected by Chrome), got: ${JSON.stringify(manifest.oauth2?.scopes)}`,
  );
}

const requiredHosts = [
  'https://www.linkedin.com/*',
  'https://gmail.googleapis.com/*',
  'https://www.googleapis.com/*',
];
for (const host of requiredHosts) {
  if (!manifest.host_permissions?.includes(host)) {
    failures.push(`host_permissions missing ${host}, got: ${JSON.stringify(manifest.host_permissions)}`);
  }
}

if (failures.length > 0) {
  console.error('Manifest validation failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('manifest OK');
