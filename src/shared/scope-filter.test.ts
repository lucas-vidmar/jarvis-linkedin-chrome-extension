import { describe, expect, it } from 'vitest';
import {
  filterMessagesByScope,
  isResolvableScope,
  isTimeScope,
} from '@/shared/scope-filter';
import type { ComposerMessage } from '@/shared/composer';

const now = new Date('2026-08-14T12:00:00Z');

function message(overrides: Partial<ComposerMessage>): ComposerMessage {
  return {
    senderKey: 'self',
    timestampMs: null,
    text: 'hello',
    fingerprint: null,
    ...overrides,
  };
}

describe('isTimeScope', () => {
  it('is true only for last-day and last-week', () => {
    expect(isTimeScope('last-day')).toBe(true);
    expect(isTimeScope('last-week')).toBe(true);
    expect(isTimeScope('since-last-sync')).toBe(false);
    expect(isTimeScope('entire-thread')).toBe(false);
    expect(isTimeScope('selected')).toBe(false);
  });
});

describe('isResolvableScope', () => {
  it('adds since-last-sync to the time scopes', () => {
    expect(isResolvableScope('since-last-sync')).toBe(true);
    expect(isResolvableScope('last-day')).toBe(true);
    expect(isResolvableScope('last-week')).toBe(true);
    expect(isResolvableScope('entire-thread')).toBe(false);
    expect(isResolvableScope('selected')).toBe(false);
  });
});

describe('filterMessagesByScope — since-last-sync', () => {
  const a = message({ fingerprint: 'a'.repeat(64) });
  const b = message({ fingerprint: 'b'.repeat(64) });
  const c = message({ fingerprint: 'c'.repeat(64) });
  const ordered = [a, b, c];

  it('WATERMARK_EXISTS: returns messages strictly after the boundary message', () => {
    const result = filterMessagesByScope(ordered, 'since-last-sync', now, {
      watermarkFingerprint: 'b'.repeat(64),
    });
    expect(result).toEqual([c]);
  });

  it('WATERMARK_IS_NEWEST: returns an empty set', () => {
    const result = filterMessagesByScope(ordered, 'since-last-sync', now, {
      watermarkFingerprint: 'c'.repeat(64),
    });
    expect(result).toEqual([]);
  });

  it('NO_WATERMARK: falls back to the full thread when no fingerprint is supplied', () => {
    expect(filterMessagesByScope(ordered, 'since-last-sync', now)).toEqual(ordered);
    expect(
      filterMessagesByScope(ordered, 'since-last-sync', now, { watermarkFingerprint: null }),
    ).toEqual(ordered);
  });

  it('WATERMARK_NOT_LOADED: returns all messages when the boundary is absent', () => {
    const result = filterMessagesByScope(ordered, 'since-last-sync', now, {
      watermarkFingerprint: 'z'.repeat(64),
    });
    expect(result).toEqual(ordered);
  });

  it('TIMESTAMP_FALLBACK: uses the watermark timestamp when the boundary is absent', () => {
    const old = message({ fingerprint: null, timestampMs: 1_000 });
    const boundary = message({ fingerprint: null, timestampMs: 2_000 });
    const newer = message({ fingerprint: null, timestampMs: 3_000 });
    const result = filterMessagesByScope(
      [old, boundary, newer],
      'since-last-sync',
      now,
      {
        watermarkFingerprint: 'z'.repeat(64),
        watermarkTimestampMs: 2_000,
      },
    );
    expect(result).toEqual([newer]);
  });

  it('TIMESTAMP_FALLBACK: excludes messages older than the watermark when the boundary is absent', () => {
    const older = message({ fingerprint: null, timestampMs: 1_000 });
    const newer = message({ fingerprint: null, timestampMs: 5_000 });
    const result = filterMessagesByScope([older, newer], 'since-last-sync', now, {
      watermarkFingerprint: 'z'.repeat(64),
      watermarkTimestampMs: 3_000,
    });
    expect(result).toEqual([newer]);
  });

  it('TIMESTAMP_FALLBACK: keeps null-timestamp messages conservatively', () => {
    const older = message({ fingerprint: null, timestampMs: 1_000 });
    const unknown = message({ fingerprint: null, timestampMs: null });
    const newer = message({ fingerprint: null, timestampMs: 5_000 });
    const result = filterMessagesByScope(
      [older, unknown, newer],
      'since-last-sync',
      now,
      {
        watermarkFingerprint: 'z'.repeat(64),
        watermarkTimestampMs: 3_000,
      },
    );
    expect(result).toEqual([unknown, newer]);
  });

  it('TIMESTAMP_FALLBACK: applies when no fingerprint is supplied but a timestamp is', () => {
    const older = message({ fingerprint: null, timestampMs: 1_000 });
    const newer = message({ fingerprint: null, timestampMs: 5_000 });
    const result = filterMessagesByScope([older, newer], 'since-last-sync', now, {
      watermarkTimestampMs: 3_000,
    });
    expect(result).toEqual([newer]);
  });

  it('BOUNDARY_PRESENT: ignores the fallback timestamp when the boundary is found', () => {
    const a1 = message({ fingerprint: 'a'.repeat(64), timestampMs: 1_000 });
    const b1 = message({ fingerprint: 'b'.repeat(64), timestampMs: 2_000 });
    const c1 = message({ fingerprint: 'c'.repeat(64), timestampMs: 3_000 });
    const result = filterMessagesByScope([a1, b1, c1], 'since-last-sync', now, {
      watermarkFingerprint: 'b'.repeat(64),
      // Deliberately newer than every message: the fingerprint path must win.
      watermarkTimestampMs: 9_000,
    });
    expect(result).toEqual([c1]);
  });

  it('NO_WATERMARK_OR_TIMESTAMP: still returns all messages', () => {
    expect(
      filterMessagesByScope(ordered, 'since-last-sync', now, {
        watermarkFingerprint: null,
        watermarkTimestampMs: null,
      }),
    ).toEqual(ordered);
  });

  it('uses the last matching occurrence as the boundary (duplicate-safe)', () => {
    const dup = message({ fingerprint: 'b'.repeat(64) });
    const result = filterMessagesByScope([a, b, dup, c], 'since-last-sync', now, {
      watermarkFingerprint: 'b'.repeat(64),
    });
    expect(result).toEqual([c]);
  });

  it('keeps null-fingerprint messages that follow the watermark', () => {
    const nullAfter = message({ fingerprint: null });
    const result = filterMessagesByScope([a, b, nullAfter], 'since-last-sync', now, {
      watermarkFingerprint: 'b'.repeat(64),
    });
    expect(result).toEqual([nullAfter]);
  });

  it('does not mutate the input array', () => {
    const before = ordered.map((m) => m.fingerprint);
    filterMessagesByScope(ordered, 'since-last-sync', now, {
      watermarkFingerprint: 'b'.repeat(64),
    });
    expect(ordered.map((m) => m.fingerprint)).toEqual(before);
  });
});

describe('filterMessagesByScope — time windows', () => {
  const hour = 60 * 60 * 1000;
  const inDay = message({ timestampMs: now.getTime() - 1 * hour });
  const inWeek = message({ timestampMs: now.getTime() - 3 * 24 * hour });
  const tooOld = message({ timestampMs: now.getTime() - 8 * 24 * hour });
  const nullTs = message({ timestampMs: null });
  const future = message({ timestampMs: now.getTime() + hour });

  it('last-day keeps only messages within the rolling 24h window', () => {
    const result = filterMessagesByScope([inDay, inWeek, tooOld, nullTs, future], 'last-day', now);
    expect(result).toEqual([inDay, nullTs]);
  });

  it('last-week keeps messages within the rolling 7d window', () => {
    const result = filterMessagesByScope([inWeek, tooOld, future], 'last-week', now);
    expect(result).toEqual([inWeek]);
  });

  it('null timestamps are always included (conservative)', () => {
    const result = filterMessagesByScope([tooOld, nullTs], 'last-day', now);
    expect(result).toEqual([nullTs]);
  });

  it('future timestamps are excluded (window capped at now)', () => {
    const result = filterMessagesByScope([future], 'last-day', now);
    expect(result).toEqual([]);
  });
});

describe('filterMessagesByScope — pass-through scopes', () => {
  it('entire-thread returns all messages unchanged regardless of options', () => {
    const messages = [
      message({ fingerprint: 'a'.repeat(64) }),
      message({ fingerprint: null }),
    ];
    const result = filterMessagesByScope(messages, 'entire-thread', now, {
      watermarkFingerprint: 'a'.repeat(64),
    });
    expect(result).toEqual(messages);
  });

  it('selected passes through unchanged', () => {
    const messages = [message({})];
    expect(filterMessagesByScope(messages, 'selected', now)).toEqual(messages);
  });
});
