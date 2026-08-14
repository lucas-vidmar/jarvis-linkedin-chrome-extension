import { describe, expect, it } from 'vitest';
import {
  defaultScope,
  getScopeCaption,
  isScopeEligible,
  SCOPE_OPTIONS,
} from '@/shared/scopes';
import { isValidFingerprint, watermarkStorageKey } from '@/shared/watermark';

describe('scopes', () => {
  it('defaultScope preselects since-last-sync with a watermark, else entire-thread', () => {
    expect(defaultScope(true)).toBe('since-last-sync');
    expect(defaultScope(false)).toBe('entire-thread');
  });

  it('shows the five scopes in order', () => {
    expect(SCOPE_OPTIONS.map((option) => option.id)).toEqual([
      'selected',
      'since-last-sync',
      'last-day',
      'last-week',
      'entire-thread',
    ]);
  });

  it('annotates the since-last-sync caption on a first sync', () => {
    expect(getScopeCaption('since-last-sync', false)).toContain('first sync');
    expect(getScopeCaption('since-last-sync', true)).not.toContain('first sync');
  });

  it('isScopeEligible rejects only the selected scope', () => {
    expect(isScopeEligible('since-last-sync')).toBe(true);
    expect(isScopeEligible('entire-thread')).toBe(true);
    expect(isScopeEligible('selected')).toBe(false);
  });
});

describe('shared watermark helpers', () => {
  it('keys storage by the normalized contact URL', () => {
    expect(watermarkStorageKey('https://www.linkedin.com/in/ada')).toBe(
      'watermark:https://www.linkedin.com/in/ada',
    );
  });

  it('isValidFingerprint accepts only 64-char lowercase hex', () => {
    expect(isValidFingerprint('a'.repeat(64))).toBe(true);
    expect(isValidFingerprint('A'.repeat(64))).toBe(false);
    expect(isValidFingerprint('z'.repeat(64))).toBe(false);
    expect(isValidFingerprint('short')).toBe(false);
    expect(isValidFingerprint(null)).toBe(false);
    expect(isValidFingerprint(undefined)).toBe(false);
  });
});
