const ZOHO_HOST_PATTERN = /^crm\.zoho\./;
const CONTACT_RECORD_PATTERN = /\/tab\/Contacts\/(\d+)/;

export function zohoContactUrlToJarvis(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!ZOHO_HOST_PATTERN.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(CONTACT_RECORD_PATTERN);
  if (!match) return null;
  return `https://jarvis.agileengine.com/contacts/${match[1]}`;
}