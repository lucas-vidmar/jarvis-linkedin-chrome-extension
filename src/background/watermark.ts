import {
  isValidFingerprint,
  shouldAdvanceWatermark,
  watermarkStorageKey,
  type WatermarkValue,
} from '@/shared/watermark';
import type { ScopeId } from '@/shared/scopes';
import type { WatermarkEntry } from '@/shared/messages';
import { StorageError } from '@/shared/errors';

const locksByContact = new Map<string, Promise<unknown>>();
const MAX_COMPOSE_FUTURE_MS = 5 * 60 * 1000;

export type AdvanceWatermarkResult =
  | { status: 'advanced' }
  | { status: 'skipped'; reason: 'scope' | 'invalid' | 'newer' }
  | { status: 'failed'; error: StorageError };

/**
 * Read the stored watermark for a conversation.
 *
 * Returns `null` only when no watermark is stored. A storage failure or an
 * unreadable stored value throws `StorageError`, so callers never mistake a
 * broken read for "first sync".
 */
export async function readWatermark(contactUrl: string): Promise<WatermarkValue | null> {
  const pending = locksByContact.get(contactUrl);
  if (pending) {
    await pending.catch(() => undefined);
  }

  let stored: Record<string, unknown>;
  try {
    stored = await chrome.storage.local.get(watermarkStorageKey(contactUrl));
  } catch {
    throw new StorageError('Could not read sync progress.');
  }

  const value = stored[watermarkStorageKey(contactUrl)] as WatermarkValue | undefined;
  if (!value) {
    return null;
  }
  if (
    !isValidFingerprint(value.fingerprint) ||
    typeof value.syncedAtEpochMs !== 'number'
  ) {
    throw new StorageError('Saved sync progress could not be read.');
  }
  return value;
}

/**
 * List all stored watermarks.
 *
 * Throws `StorageError` when storage itself fails; an empty list always means
 * "nothing synced yet", never "the read failed".
 */
export async function listWatermarks(): Promise<WatermarkEntry[]> {
  let all: Record<string, unknown>;
  try {
    all = await chrome.storage.local.get(null);
  } catch {
    throw new StorageError('Could not load sync history.');
  }

  const entries: WatermarkEntry[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('watermark:')) continue;
    const watermark = value as WatermarkValue | undefined;
    if (
      !watermark ||
      !isValidFingerprint(watermark.fingerprint) ||
      typeof watermark.syncedAtEpochMs !== 'number'
    ) {
      continue;
    }
    entries.push({ contactUrl: key.slice('watermark:'.length), watermark });
  }
  return entries.sort((a, b) => b.watermark.syncedAtEpochMs - a.watermark.syncedAtEpochMs);
}

export async function resetWatermark(contactUrl: string): Promise<void> {
  const previous = locksByContact.get(contactUrl) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await chrome.storage.local.remove(watermarkStorageKey(contactUrl));
      } catch {
        throw new StorageError('Could not reset sync progress.');
      }
    });
  locksByContact.set(contactUrl, run);
  try {
    await run;
  } finally {
    if (locksByContact.get(contactUrl) === run) {
      locksByContact.delete(contactUrl);
    }
  }
}

/**
 * Advance the watermark only when the sync scope covers the current boundary.
 *
 * Returns a result instead of pretending success: `failed` means the storage
 * write did not happen, so the caller must not claim the sync point moved.
 */
export async function advanceWatermarkForScope(
  scope: ScopeId | null | undefined,
  contactUrl: string,
  fingerprint: string | null | undefined,
  composedAtEpochMs: number,
  lastMessageTimestampMs?: number | null,
): Promise<AdvanceWatermarkResult> {
  if (!shouldAdvanceWatermark(scope)) {
    return { status: 'skipped', reason: 'scope' };
  }
  return advanceWatermark(
    contactUrl,
    fingerprint,
    composedAtEpochMs,
    lastMessageTimestampMs,
  );
}

export async function advanceWatermark(
  contactUrl: string,
  fingerprint: string | null | undefined,
  composedAtEpochMs: number,
  lastMessageTimestampMs?: number | null,
): Promise<AdvanceWatermarkResult> {
  if (
    !isValidFingerprint(fingerprint) ||
    !Number.isFinite(composedAtEpochMs) ||
    composedAtEpochMs > Date.now() + MAX_COMPOSE_FUTURE_MS
  ) {
    return { status: 'skipped', reason: 'invalid' };
  }
  const previous = locksByContact.get(contactUrl) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async (): Promise<AdvanceWatermarkResult> => {
      try {
        const key = watermarkStorageKey(contactUrl);
        const stored = await chrome.storage.local.get(key);
        const existing = stored[key] as WatermarkValue | undefined;
        if (
          existing &&
          typeof existing.syncedAtEpochMs === 'number' &&
          existing.syncedAtEpochMs > composedAtEpochMs
        ) {
          return { status: 'skipped', reason: 'newer' };
        }
        const value: WatermarkValue = {
          fingerprint,
          syncedAtEpochMs: composedAtEpochMs,
        };
        // Only persist a usable boundary timestamp. Old entries simply omit
        // the field, and a null last-message timestamp means the extractor
        // could not read one, so recording nothing is more honest than
        // recording a bad boundary.
        if (
          typeof lastMessageTimestampMs === 'number' &&
          Number.isFinite(lastMessageTimestampMs)
        ) {
          value.lastMessageTimestampMs = lastMessageTimestampMs;
        }
        await chrome.storage.local.set({ [key]: value });
        return { status: 'advanced' };
      } catch {
        return {
          status: 'failed',
          error: new StorageError('Could not save sync progress.'),
        };
      }
    });
  locksByContact.set(contactUrl, run);
  try {
    return await run;
  } finally {
    if (locksByContact.get(contactUrl) === run) {
      locksByContact.delete(contactUrl);
    }
  }
}
