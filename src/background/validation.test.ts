import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAllowedGmailComposeUrl,
  isAllowedLinkedInContactUrl,
  validateSendSyncEmailRequest,
  type ValidationResult,
} from '@/background/validation';
import { MAX_BODY_CHARS } from '@/shared/composer';

const CONTACT_URL = 'https://www.linkedin.com/in/ada-lovelace';
const VALID_FINGERPRINT = 'a'.repeat(64);

function makeEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    to: 'jarvis@agileengine.com',
    subject: 'LinkedIn sync: Ada Lovelace',
    body: `${CONTACT_URL}\nSynced 2026-01-02 — Entire thread\n\n[Ada] hello`,
    truncated: false,
    omittedCount: 0,
    lastMessageFingerprint: VALID_FINGERPRINT,
    lastMessageTimestampMs: 1_700_000_000_000,
    composedAtEpochMs: 1_700_000_060_000,
    ...overrides,
  };
}

function makeRequest(
  overrides: {
    contactUrl?: unknown;
    syncId?: unknown;
    envelope?: Record<string, unknown>;
  } = {},
): Record<string, unknown> {
  return {
    type: 'SEND_SYNC_EMAIL',
    requestId: 'req-1',
    syncId: 'sync-1',
    contactUrl: CONTACT_URL,
    scope: 'entire-thread',
    envelope: makeEnvelope(overrides.envelope),
    ...(overrides.contactUrl !== undefined ? { contactUrl: overrides.contactUrl } : {}),
    ...(overrides.syncId !== undefined ? { syncId: overrides.syncId } : {}),
  };
}

function expectFailure(result: ValidationResult, reason: string): void {
  expect(result).toEqual({ ok: false, reason });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateSendSyncEmailRequest', () => {
  it('accepts a well-formed request', () => {
    expect(validateSendSyncEmailRequest(makeRequest())).toEqual({ ok: true });
  });

  it('accepts a null last-message fingerprint and timestamp', () => {
    expect(
      validateSendSyncEmailRequest(
        makeRequest({
          envelope: { lastMessageFingerprint: null, lastMessageTimestampMs: null },
        }),
      ),
    ).toEqual({ ok: true });
  });

  it('rejects non-object requests', () => {
    expectFailure(validateSendSyncEmailRequest(null), 'envelope');
    expectFailure(validateSendSyncEmailRequest('send'), 'envelope');
  });

  it('rejects a missing envelope', () => {
    expectFailure(
      validateSendSyncEmailRequest({
        contactUrl: CONTACT_URL,
        syncId: 'sync-1',
        envelope: undefined,
      }),
      'envelope',
    );
  });

  describe('contactUrl', () => {
    it('rejects non-LinkedIn, non-https, and lookalike hosts', () => {
      for (const url of [
        'https://example.com/in/ada',
        'http://www.linkedin.com/in/ada',
        'https://www.linkedin.com.evil.test/in/ada',
        'https://evil.test/www.linkedin.com/in/ada',
        'javascript:alert(1)',
        'not a url',
        '',
        42,
      ]) {
        expectFailure(
          validateSendSyncEmailRequest(makeRequest({ contactUrl: url })),
          'contact-url',
        );
      }
    });

    it('rejects a non-default port', () => {
      expectFailure(
        validateSendSyncEmailRequest(
          makeRequest({ contactUrl: 'https://www.linkedin.com:8443/in/ada' }),
        ),
        'contact-url',
      );
    });

    it('accepts messaging and profile URLs', () => {
      for (const url of [
        'https://www.linkedin.com/messaging/thread/abc123/',
        'https://www.linkedin.com/in/ada/',
      ]) {
        expect(
          validateSendSyncEmailRequest(makeRequest({ contactUrl: url })),
        ).toEqual({ ok: true });
      }
    });
  });

  describe('syncId', () => {
    it('rejects blank or non-string ids', () => {
      expectFailure(validateSendSyncEmailRequest(makeRequest({ syncId: '' })), 'sync-id');
      expectFailure(validateSendSyncEmailRequest(makeRequest({ syncId: '   ' })), 'sync-id');
      expectFailure(validateSendSyncEmailRequest(makeRequest({ syncId: 1 })), 'sync-id');
    });
  });

  describe('envelope.to', () => {
    it('rejects malformed recipients', () => {
      for (const to of ['not-an-email', 'a@b', 'two words@example.com', '', 42, null]) {
        expectFailure(
          validateSendSyncEmailRequest(makeRequest({ envelope: { to } })),
          'recipient',
        );
      }
    });
  });

  describe('recipient allowlist', () => {
    it('allows any recipient when no domain is configured', () => {
      vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', '');
      expect(validateSendSyncEmailRequest(makeRequest())).toEqual({ ok: true });
    });

    it('rejects recipients outside the configured domain', () => {
      vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', 'agileengine.com');
      expectFailure(
        validateSendSyncEmailRequest(
          makeRequest({ envelope: { to: 'someone@example.com' } }),
        ),
        'recipient-domain',
      );
    });

    it('accepts recipients on the configured domain and its subdomains', () => {
      vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', 'agileengine.com');
      for (const to of ['jarvis@agileengine.com', 'jarvis@mail.agileengine.com']) {
        expect(
          validateSendSyncEmailRequest(makeRequest({ envelope: { to } })),
        ).toEqual({ ok: true });
      }
    });

    it('lets an explicit domain override the environment', () => {
      vi.stubEnv('WXT_ALLOWED_RECIPIENT_DOMAIN', 'agileengine.com');
      expect(
        validateSendSyncEmailRequest(makeRequest(), 'example.com'),
      ).toEqual({ ok: false, reason: 'recipient-domain' });
      expect(validateSendSyncEmailRequest(makeRequest(), null)).toEqual({ ok: true });
    });
  });

  describe('subject', () => {
    it('rejects empty, oversized, and non-string subjects', () => {
      for (const subject of ['', '   ', 'x'.repeat(999), 7, null]) {
        expectFailure(
          validateSendSyncEmailRequest(makeRequest({ envelope: { subject } })),
          'subject',
        );
      }
    });

    it('accepts a subject at the size limit', () => {
      expect(
        validateSendSyncEmailRequest(
          makeRequest({ envelope: { subject: 'x'.repeat(998) } }),
        ),
      ).toEqual({ ok: true });
    });
  });

  describe('body', () => {
    it('rejects empty, oversized, and non-string bodies', () => {
      for (const body of ['', '   ', 'x'.repeat(MAX_BODY_CHARS + 1), 7, null]) {
        expectFailure(
          validateSendSyncEmailRequest(makeRequest({ envelope: { body } })),
          'body',
        );
      }
    });

    it('accepts a body at the size limit', () => {
      expect(
        validateSendSyncEmailRequest(
          makeRequest({ envelope: { body: 'x'.repeat(MAX_BODY_CHARS) } }),
        ),
      ).toEqual({ ok: true });
    });
  });

  describe('lastMessageFingerprint', () => {
    it('rejects wrong lengths, uppercase, and non-strings', () => {
      for (const value of [
        'a'.repeat(63),
        'a'.repeat(65),
        'A'.repeat(64),
        'g'.repeat(64),
        undefined,
        12,
      ]) {
        expectFailure(
          validateSendSyncEmailRequest(
            makeRequest({ envelope: { lastMessageFingerprint: value } }),
          ),
          'fingerprint',
        );
      }
    });
  });

  describe('timestamps', () => {
    it('rejects non-finite or non-numeric composedAtEpochMs', () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '1700000000000', null]) {
        expectFailure(
          validateSendSyncEmailRequest(
            makeRequest({ envelope: { composedAtEpochMs: value } }),
          ),
          'composed-at',
        );
      }
    });

    it('rejects non-finite or non-numeric lastMessageTimestampMs', () => {
      for (const value of [Number.NaN, Number.NEGATIVE_INFINITY, '1700000000000', undefined]) {
        expectFailure(
          validateSendSyncEmailRequest(
            makeRequest({ envelope: { lastMessageTimestampMs: value } }),
          ),
          'last-message-timestamp',
        );
      }
    });
  });

  it('rejects a malformed truncated/omittedCount pair', () => {
    for (const envelope of [
      { truncated: 'false' },
      { omittedCount: -1 },
      { omittedCount: 1.5 },
      { omittedCount: '0' },
    ]) {
      expectFailure(
        validateSendSyncEmailRequest(makeRequest({ envelope })),
        'envelope',
      );
    }
  });
});

describe('isAllowedLinkedInContactUrl', () => {
  it('only accepts https www.linkedin.com URLs', () => {
    expect(isAllowedLinkedInContactUrl(CONTACT_URL)).toBe(true);
    expect(isAllowedLinkedInContactUrl('https://www.linkedin.com')).toBe(true);
    expect(isAllowedLinkedInContactUrl('https://linkedin.com/in/ada')).toBe(false);
    expect(isAllowedLinkedInContactUrl('http://www.linkedin.com/in/ada')).toBe(false);
  });
});

describe('isAllowedGmailComposeUrl', () => {
  it('accepts https Gmail compose paths', () => {
    for (const url of [
      'https://mail.google.com/mail/?view=cm&fs=1&to=a%40example.com',
      'https://mail.google.com/mail/u/0/#drafts',
      'https://mail.google.com/mail/u/0/#inbox',
    ]) {
      expect(isAllowedGmailComposeUrl(url)).toBe(true);
    }
  });

  it('rejects wrong schemes, hosts, and paths', () => {
    for (const url of [
      'http://mail.google.com/mail/?view=cm',
      'https://mail.google.com.evil.test/mail/?view=cm',
      'https://evil.test/mail/?view=cm',
      'https://mail.google.com/',
      'https://mail.google.com/mail',
      'https://mail.google.com/mail?view=cm',
      'https://mail.google.com:8443/mail/?view=cm',
      'javascript:alert(1)',
      'not a url',
      '',
      42,
      null,
    ]) {
      expect(isAllowedGmailComposeUrl(url)).toBe(false);
    }
  });
});
