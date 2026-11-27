import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SYNC_RECIPIENT,
  isRecipientAllowed,
  isValidRecipient,
  recipientDomain,
  RECIPIENT_STORAGE_KEY,
  resolveAllowedRecipientDomain,
  resolveDefaultRecipient,
} from '@/shared/recipient';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isValidRecipient', () => {
  it('accepts a normal email address', () => {
    expect(isValidRecipient('someone@example.com')).toBe(true);
  });

  it('accepts subdomain and plus-address forms', () => {
    expect(isValidRecipient('first.last+tag@mail.example.co')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(isValidRecipient('  someone@example.com  ')).toBe(true);
  });

  it('rejects values without an @', () => {
    expect(isValidRecipient('someone.example.com')).toBe(false);
  });

  it('rejects values without a domain', () => {
    expect(isValidRecipient('someone@example')).toBe(false);
  });

  it('rejects spaces and empty strings', () => {
    expect(isValidRecipient('some one@example.com')).toBe(false);
    expect(isValidRecipient('')).toBe(false);
  });
});

describe('recipient defaults', () => {
  it('exposes the default sync recipient', () => {
    expect(DEFAULT_SYNC_RECIPIENT).toBe('jarvis@agileengine.com');
  });

  it('uses a distinct storage key', () => {
    expect(RECIPIENT_STORAGE_KEY).toBe('syncRecipient');
  });

  it('falls back to the default recipient when no env override is set', () => {
    vi.stubEnv('WXT_JARVIS_RECIPIENT', '');
    expect(resolveDefaultRecipient()).toBe(DEFAULT_SYNC_RECIPIENT);
  });

  it('ignores an invalid env override', () => {
    vi.stubEnv('WXT_JARVIS_RECIPIENT', 'not-an-email');
    expect(resolveDefaultRecipient()).toBe(DEFAULT_SYNC_RECIPIENT);
  });

  it('uses a valid env override as the default', () => {
    vi.stubEnv('WXT_JARVIS_RECIPIENT', 'override@example.com');
    expect(resolveDefaultRecipient()).toBe('override@example.com');
  });
});

describe('recipient allowlist', () => {
  it('is disabled when the env var is unset or blank', () => {
    vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', '');
    expect(resolveAllowedRecipientDomain()).toBeNull();
    expect(isRecipientAllowed('anyone@example.com')).toBe(true);
    expect(isRecipientAllowed('anyone@example.com', null)).toBe(true);
  });

  it('normalizes the configured domain', () => {
    vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', '  @AgileEngine.COM. ');
    expect(resolveAllowedRecipientDomain()).toBe('agileengine.com');
  });

  it('extracts the recipient domain', () => {
    expect(recipientDomain('first.last+tag@mail.example.com')).toBe('mail.example.com');
    expect(recipientDomain('  someone@Example.COM ')).toBe('example.com');
    expect(recipientDomain('someone.example.com')).toBeNull();
    expect(recipientDomain('someone@')).toBeNull();
  });

  it('allows addresses on the configured domain and its subdomains', () => {
    expect(isRecipientAllowed('jarvis@agileengine.com', 'agileengine.com')).toBe(true);
    expect(isRecipientAllowed('JARVIS@AGILEENGINE.COM', 'agileengine.com')).toBe(true);
    expect(isRecipientAllowed('jarvis@mail.agileengine.com', 'agileengine.com')).toBe(true);
    expect(isRecipientAllowed('jarvis@agileengine.com', '@AgileEngine.com')).toBe(true);
  });

  it('rejects addresses outside the configured domain', () => {
    expect(isRecipientAllowed('someone@example.com', 'agileengine.com')).toBe(false);
    expect(isRecipientAllowed('someone@notagileengine.com', 'agileengine.com')).toBe(false);
    expect(isRecipientAllowed('someone@agileengine.com.evil.test', 'agileengine.com')).toBe(
      false,
    );
    expect(isRecipientAllowed('not-an-email', 'agileengine.com')).toBe(false);
  });

  it('fails closed for a malformed configured domain', () => {
    // A typo (spaces, no dot) matches no real address instead of silently
    // disabling the allowlist.
    expect(resolveAllowedRecipientDomain()).toBeNull();
    vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', 'not a domain');
    expect(resolveAllowedRecipientDomain()).toBe('not a domain');
    expect(isRecipientAllowed('someone@example.com')).toBe(false);
  });

  it('uses the environment value by default', () => {
    vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', 'example.com');
    expect(isRecipientAllowed('someone@example.com')).toBe(true);
    expect(isRecipientAllowed('someone@elsewhere.com')).toBe(false);
  });
});