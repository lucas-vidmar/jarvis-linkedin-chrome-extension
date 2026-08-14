import { describe, expect, it } from 'vitest';
import {
  allFingerprintsUsable,
  computeMessageFingerprint,
  fingerprintSource,
  normalizeFingerprintText,
} from '@/shared/fingerprint';

describe('fingerprint', () => {
  it('normalizes whitespace runs to single spaces and trims', () => {
    expect(normalizeFingerprintText('  hello   world\nagain ')).toBe('hello world again');
  });

  it('builds a stable source string from sender | epoch | normalized text', () => {
    expect(fingerprintSource('self', 123, 'hi  there')).toBe('self|123|hi there');
  });

  it('computes the documented SHA-256 fingerprint', async () => {
    const fingerprint = await computeMessageFingerprint({
      senderKey: 'self',
      epochMs: 1_700_000_000_000,
      text: 'hello',
    });
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null for an unusable (null) epoch', async () => {
    const fingerprint = await computeMessageFingerprint({
      senderKey: 'self',
      epochMs: null,
      text: 'hello',
    });
    expect(fingerprint).toBeNull();
  });

  it('is deterministic for identical input', async () => {
    const input = { senderKey: 'contact', epochMs: 123, text: 'same' };
    const a = await computeMessageFingerprint(input);
    const b = await computeMessageFingerprint(input);
    expect(a).toBe(b);
  });

  it('allFingerprintsUsable is false when any fingerprint is null', () => {
    expect(allFingerprintsUsable([{ fingerprint: 'a' }, { fingerprint: 'b' }])).toBe(true);
    expect(allFingerprintsUsable([{ fingerprint: 'a' }, { fingerprint: null }])).toBe(false);
  });
});
