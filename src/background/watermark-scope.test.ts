import { beforeEach, describe, expect, it } from 'vitest';
import { advanceWatermarkForScope } from '@/background/watermark';
import type { ScopeId } from '@/shared/scopes';
import { watermarkStorageKey, type WatermarkValue } from '@/shared/watermark';

const CONTACT_URL = 'https://www.linkedin.com/in/ada';
const STORAGE_KEY = watermarkStorageKey(CONTACT_URL);
const NEW_FINGERPRINT = 'a'.repeat(64);
const OLD_FINGERPRINT = 'b'.repeat(64);
const COMPOSED_AT_EPOCH_MS = Date.UTC(2026, 0, 2, 12, 0, 0);

const store = new Map<string, unknown>();

const fakeChrome = {
  storage: {
    local: {
      async get(key: string | null): Promise<Record<string, unknown>> {
        if (key === null) return Object.fromEntries(store);
        return store.has(key) ? { [key]: store.get(key) } : {};
      },
      async set(items: Record<string, unknown>): Promise<void> {
        for (const [key, value] of Object.entries(items)) {
          store.set(key, value);
        }
      },
      async remove(key: string): Promise<void> {
        store.delete(key);
      },
    },
  },
};

beforeEach(() => {
  store.clear();
  (globalThis as { chrome?: unknown }).chrome = fakeChrome;
});

function seedOldWatermark(): WatermarkValue {
  const previous: WatermarkValue = {
    fingerprint: OLD_FINGERPRINT,
    syncedAtEpochMs: COMPOSED_AT_EPOCH_MS - 60_000,
  };
  store.set(STORAGE_KEY, previous);
  return previous;
}

describe('advanceWatermarkForScope', () => {
  it.each<ScopeId>(['entire-thread', 'since-last-sync'])(
    'advances the watermark for the %s scope',
    async (scope) => {
      const advanced = await advanceWatermarkForScope(
        scope,
        CONTACT_URL,
        NEW_FINGERPRINT,
        COMPOSED_AT_EPOCH_MS,
      );

      expect(advanced).toBe(true);
      expect(store.get(STORAGE_KEY)).toEqual({
        fingerprint: NEW_FINGERPRINT,
        syncedAtEpochMs: COMPOSED_AT_EPOCH_MS,
      });
    },
  );

  it.each<ScopeId>(['selected', 'last-day', 'last-week'])(
    'leaves the watermark untouched for the %s scope',
    async (scope) => {
      const previous = seedOldWatermark();

      const advanced = await advanceWatermarkForScope(
        scope,
        CONTACT_URL,
        NEW_FINGERPRINT,
        COMPOSED_AT_EPOCH_MS,
      );

      expect(advanced).toBe(false);
      expect(store.get(STORAGE_KEY)).toEqual(previous);
    },
  );

  it('leaves the watermark untouched when the scope is missing', async () => {
    const previous = seedOldWatermark();

    const advanced = await advanceWatermarkForScope(
      undefined,
      CONTACT_URL,
      NEW_FINGERPRINT,
      COMPOSED_AT_EPOCH_MS,
    );

    expect(advanced).toBe(false);
    expect(store.get(STORAGE_KEY)).toEqual(previous);
  });

  it('does not write an unusable fingerprint even for an advancing scope', async () => {
    const previous = seedOldWatermark();

    const advanced = await advanceWatermarkForScope(
      'entire-thread',
      CONTACT_URL,
      null,
      COMPOSED_AT_EPOCH_MS,
    );

    expect(advanced).toBe(true);
    expect(store.get(STORAGE_KEY)).toEqual(previous);
  });
});
