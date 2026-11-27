export const DEFAULT_SYNC_RECIPIENT = 'jarvis@agileengine.com';
export const RECIPIENT_STORAGE_KEY = 'syncRecipient';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidRecipient(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function resolveDefaultRecipient(): string {
  const configured = import.meta.env.WXT_JARVIS_RECIPIENT;
  if (typeof configured === 'string' && isValidRecipient(configured)) {
    return configured.trim();
  }
  return DEFAULT_SYNC_RECIPIENT;
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, '').replace(/\.+$/, '');
}

/**
 * Optional build-time recipient allowlist.
 *
 * `WXT_ALLOWED_RECIPIENT_DOMAIN=example.com` restricts sends to that domain and
 * its subdomains; unset (or blank) preserves the previous behavior of allowing
 * any valid address. A configured value is used verbatim, so a typo simply
 * matches nothing and fails closed instead of silently disabling the check.
 */
export function resolveAllowedRecipientDomain(): string | null {
  const configured = import.meta.env.WXT_ALLOWED_RECIPIENT_DOMAIN;
  if (typeof configured !== 'string') return null;
  const domain = normalizeDomain(configured);
  return domain === '' ? null : domain;
}

export function recipientDomain(value: string): string | null {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1).toLowerCase();
}

/**
 * Whether `value` may receive a sync email under `allowedDomain`.
 *
 * `null`/blank means no allowlist is configured and every valid recipient is
 * accepted. Domains are compared case-insensitively and subdomains of the
 * configured domain are accepted.
 */
export function isRecipientAllowed(
  value: string,
  allowedDomain: string | null = resolveAllowedRecipientDomain(),
): boolean {
  if (allowedDomain === null) return true;
  const allowed = normalizeDomain(allowedDomain);
  if (allowed === '') return true;

  const domain = recipientDomain(value);
  if (!domain) return false;
  return domain === allowed || domain.endsWith(`.${allowed}`);
}
