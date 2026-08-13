import {
  isValidFingerprint,
  watermarkStorageKey,
  type WatermarkValue,
} from '@/shared/watermark';

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
