/**
 * Canonical list of Zoho CRM web hosts, one per Zoho data center.
 *
 * Sources:
 * - Zoho CRM Multi-DC docs (US, AU, EU, IN, CN, JP, SA, CA):
 *   https://www.zoho.com/crm/developer/docs/api/v8/multi-dc.html
 * - Zoho data-center domain table (adds UAE and Singapore):
 *   https://www.zoho.com/connect/api/server-domains.html
 *
 * Canada uses the `zohocloud.ca` domain rather than `zoho.ca`. Only exact
 * hosts are accepted so lookalikes such as `crm.zoho.evil.com` are rejected.
 */
export const ZOHO_CRM_HOSTS = [
  'crm.zoho.com',
  'crm.zoho.eu',
  'crm.zoho.in',
  'crm.zoho.com.au',
  'crm.zoho.jp',
  'crm.zoho.com.cn',
  'crm.zohocloud.ca',
  'crm.zoho.sa',
  'crm.zoho.ae',
  'crm.zoho.sg',
] as const;

/** Chrome match-pattern origins for the supported Zoho CRM hosts. */
export const ZOHO_CRM_ORIGIN_PATTERNS = ZOHO_CRM_HOSTS.map((host) => `https://${host}/*`);

const ZOHO_CRM_HOST_SET: ReadonlySet<string> = new Set(ZOHO_CRM_HOSTS);
const CONTACT_RECORD_PATTERN = /\/tab\/Contacts\/(\d+)/;

export function zohoContactUrlToJarvis(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ZOHO_CRM_HOST_SET.has(parsed.hostname)) return null;
  const match = parsed.pathname.match(CONTACT_RECORD_PATTERN);
  if (!match) return null;
  return `https://jarvis.agileengine.com/contacts/${match[1]}`;
}
