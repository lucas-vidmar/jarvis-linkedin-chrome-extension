import {
  isValidFingerprint,
  watermarkStorageKey,
  type WatermarkValue,
} from '@/shared/watermark';
import type { WatermarkEntry } from '@/shared/messages';

const locksByContact = new Map<string, Promise<unknown>>();
const MAX_COMPOSE_FUTURE_MS = 5 * 60 * 1000;

export async function readWatermark(contactUrl: string): Promise<WatermarkValue | null> {
  const pending = locksByContact.get(contactUrl);
  if (pending) {
    await pending.catch(() => undefined);
  }
  try {
    const stored = await chrome.storage.local.get(watermarkStorageKey(contactUrl));
    const value = stored[watermarkStorageKey(contactUrl)] as WatermarkValue | undefined;
    if (
      !value ||
      !isValidFingerprint(value.fingerprint) ||
      typeof value.syncedAtEpochMs !== 'number'
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function listWatermarks(): Promise<WatermarkEntry[]> {
  try {
    const all = await chrome.storage.local.get(null);
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
  } catch {
    return [];
  }
}

export async function resetWatermark(contactUrl: string): Promise<void> {
  const previous = locksByContact.get(contactUrl) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      await chrome.storage.local.remove(watermarkStorageKey(contactUrl));
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

export async function advanceWatermark(
  contactUrl: string,
  fingerprint: string | null | undefined,
  composedAtEpochMs: number,
): Promise<void> {
  if (
    !isValidFingerprint(fingerprint) ||
    !Number.isFinite(composedAtEpochMs) ||
    composedAtEpochMs > Date.now() + MAX_COMPOSE_FUTURE_MS
  ) {
    return;
  }
  const previous = locksByContact.get(contactUrl) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const key = watermarkStorageKey(contactUrl);
        const stored = await chrome.storage.local.get(key);
        const existing = stored[key] as WatermarkValue | undefined;
        if (
          existing &&
          typeof existing.syncedAtEpochMs === 'number' &&
          existing.syncedAtEpochMs > composedAtEpochMs
        ) {
          return;
        }
        await chrome.storage.local.set({
          [key]: {
            fingerprint,
            syncedAtEpochMs: composedAtEpochMs,
          } satisfies WatermarkValue,
        });
      } catch (error) {
        console.warn('[jarvis-sync] watermark advance failed:', error);
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
