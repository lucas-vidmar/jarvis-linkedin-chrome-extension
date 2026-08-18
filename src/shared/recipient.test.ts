import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SYNC_RECIPIENT,
  isValidRecipient,
  RECIPIENT_STORAGE_KEY,
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