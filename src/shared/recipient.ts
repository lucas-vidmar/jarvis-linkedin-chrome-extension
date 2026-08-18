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