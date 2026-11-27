import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceWatermark,
  advanceWatermarkForScope,
  listWatermarks,
  readWatermark,
  resetWatermark,
} from '@/background/watermark';
import {
  InvalidRecipientError,
  readRecipient,
  saveRecipient,
} from '@/background/recipient';
import { DEFAULT_SYNC_RECIPIENT, RECIPIENT_STORAGE_KEY } from '@/shared/recipient';
import { StorageError } from '@/shared/errors';
import {
  watermarkStorageKey,
  type WatermarkValue,
} from '@/shared/watermark';

const CONTACT_URL = 'https://www.linkedin.com/in/ada';
const STORAGE_KEY = watermarkStorageKey(CONTACT_URL);
const NEW_FINGERPRINT = 'a'.repeat(64);
const OLD_FINGERPRINT = 'b'.repeat(64);
const COMPOSED_AT_EPOCH_MS = Date.UTC(2026, 0, 2, 12, 0, 0);

type StorageMode = 'ok' | 'read-throws' | 'write-throws';

let mode: StorageMode;
let localStore: Map<string, unknown>;
let syncStore: Map<string, unknown>;

function makeStorageArea(store: Map<string, unknown>) {
  return {
    async get(key: string | string[] | null): Promise<Record<string, unknown>> {
      if (mode === 'read-throws') {
        throw new Error('storage read failed');
      }
      if (key === null) {
        return Object.fromEntries(store);
      }
      const keys = Array.isArray(key) ? key : [key];
      const result: Record<string, unknown> = {};
      for (const item of keys) {
        if (store.has(item)) {
          result[item] = store.get(item);
        }
      }
      return result;
    },
    async set(items: Record<string, unknown>): Promise<void> {
      if (mode === 'write-throws') {
        throw new Error('storage write failed');
      }
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    async remove(key: string): Promise<void> {
      if (mode === 'write-throws') {
        throw new Error('storage write failed');
      }
      store.delete(key);
    },
  };
}

beforeEach(() => {
  mode = 'ok';
  localStore = new Map();
  syncStore = new Map();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: makeStorageArea(localStore),
      sync: makeStorageArea(syncStore),
    },
  };
});

function seedWatermark(): WatermarkValue {
  const watermark: WatermarkValue = {
    fingerprint: OLD_FINGERPRINT,
    syncedAtEpochMs: COMPOSED_AT_EPOCH_MS - 60_000,
  };
  localStore.set(STORAGE_KEY, watermark);
  return watermark;
}

describe('watermark storage failures', () => {
  it('readWatermark throws a StorageError instead of reporting "not found"', async () => {
    mode = 'read-throws';

    await expect(readWatermark(CONTACT_URL)).rejects.toBeInstanceOf(StorageError);
  });

  it('readWatermark still returns null when nothing is stored', async () => {
    await expect(readWatermark(CONTACT_URL)).resolves.toBeNull();
  });

  it('readWatermark throws for a corrupt stored value', async () => {
    localStore.set(STORAGE_KEY, { fingerprint: 'not-a-fingerprint', syncedAtEpochMs: 1 });

    await expect(readWatermark(CONTACT_URL)).rejects.toBeInstanceOf(StorageError);
  });

  it('advanceWatermark reports failed when the read fails', async () => {
    mode = 'read-throws';

    const result = await advanceWatermark(
      CONTACT_URL,
      NEW_FINGERPRINT,
      COMPOSED_AT_EPOCH_MS,
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toBeInstanceOf(StorageError);
    }
  });

  it('advanceWatermark reports failed when the write fails', async () => {
    mode = 'write-throws';

    const result = await advanceWatermark(
      CONTACT_URL,
      NEW_FINGERPRINT,
      COMPOSED_AT_EPOCH_MS,
    );

    expect(result.status).toBe('failed');
    expect(localStore.has(STORAGE_KEY)).toBe(false);
  });

  it('advanceWatermarkForScope reports failed for an advancing scope', async () => {
    mode = 'write-throws';

    const result = await advanceWatermarkForScope(
      'entire-thread',
      CONTACT_URL,
      NEW_FINGERPRINT,
      COMPOSED_AT_EPOCH_MS,
    );

    expect(result.status).toBe('failed');
  });

  it('listWatermarks throws instead of returning an empty history', async () => {
    mode = 'read-throws';

    await expect(listWatermarks()).rejects.toBeInstanceOf(StorageError);
  });

  it('listWatermarks returns an empty list only when storage works', async () => {
    await expect(listWatermarks()).resolves.toEqual([]);
  });

  it('resetWatermark throws when the remove fails', async () => {
    seedWatermark();
    mode = 'write-throws';

    await expect(resetWatermark(CONTACT_URL)).rejects.toBeInstanceOf(StorageError);
  });
});

describe('recipient storage failures', () => {
  it('readRecipient throws instead of silently using the default', async () => {
    mode = 'read-throws';

    await expect(readRecipient()).rejects.toBeInstanceOf(StorageError);
  });

  it('readRecipient uses the default only when nothing is stored', async () => {
    await expect(readRecipient()).resolves.toEqual({
      recipient: DEFAULT_SYNC_RECIPIENT,
      isDefault: true,
    });
  });

  it('readRecipient returns the stored address', async () => {
    syncStore.set(RECIPIENT_STORAGE_KEY, '  team@example.com  ');

    await expect(readRecipient()).resolves.toEqual({
      recipient: 'team@example.com',
      isDefault: false,
    });
  });

  it('readRecipient throws when the stored value is unusable', async () => {
    syncStore.set(RECIPIENT_STORAGE_KEY, 'not-an-email');

    await expect(readRecipient()).rejects.toBeInstanceOf(StorageError);
  });

  it('saveRecipient throws a StorageError when the write fails', async () => {
    mode = 'write-throws';

    await expect(saveRecipient('team@example.com')).rejects.toBeInstanceOf(StorageError);
  });

  it('saveRecipient keeps validation errors separate from storage errors', async () => {
    await expect(saveRecipient('not-an-email')).rejects.toBeInstanceOf(
      InvalidRecipientError,
    );
  });
});
