import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_COMPOSE_URL_LENGTH,
  composeUrlTooLongError,
  isComposeUrlWithinLimit,
  openDraftFallback,
} from '@/content/draft-fallback';
import type { JarvisEnvelope } from '@/shared/composer';

function envelopeWithBody(body: string): JarvisEnvelope {
  return {
    to: 'sync@example.com',
    subject: 'LinkedIn sync: Ada',
    body,
    truncated: false,
    omittedCount: 0,
    lastMessageFingerprint: null,
    lastMessageTimestampMs: null,
    composedAtEpochMs: 1_700_000_000_000,
  };
}

describe('isComposeUrlWithinLimit', () => {
  it('accepts URLs at or below the limit', () => {
    expect(isComposeUrlWithinLimit('a'.repeat(MAX_COMPOSE_URL_LENGTH))).toBe(true);
  });

  it('rejects URLs above the limit', () => {
    expect(isComposeUrlWithinLimit('a'.repeat(MAX_COMPOSE_URL_LENGTH + 1))).toBe(false);
  });

  it('supports a custom maximum length', () => {
    expect(isComposeUrlWithinLimit('abcd', 4)).toBe(true);
    expect(isComposeUrlWithinLimit('abcde', 4)).toBe(false);
  });
});

describe('openDraftFallback URL guard', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessage = vi.fn();
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage },
    };
  });

  it('rejects oversized drafts with a clear smaller-scope message before opening a tab', async () => {
    await expect(
      openDraftFallback({
        contactUrl: 'https://www.linkedin.com/in/ada/',
        envelope: envelopeWithBody('x'.repeat(20_000)),
      }),
    ).rejects.toMatchObject({
      code: 'SEND_FAILED',
      message: composeUrlTooLongError().message,
      retryable: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps normal drafts under the limit', () => {
    const envelope = envelopeWithBody('Short message.');
    expect(envelope.body.length).toBeLessThan(MAX_COMPOSE_URL_LENGTH);
  });
});
