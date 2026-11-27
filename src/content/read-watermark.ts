import type { AppError, ReadWatermarkResult } from '@/shared/messages';
import { isValidFingerprint } from '@/shared/watermark';
import type { WatermarkValue } from '@/shared/watermark';
import { storageAppError } from '@/shared/errors';

export async function readWatermark(contactUrl: string): Promise<WatermarkValue | null> {
  const requestId = crypto.randomUUID();

  let reply: {
    type: 'READ_WATERMARK';
    requestId: string;
    ok: boolean;
    data?: ReadWatermarkResult;
    error?: AppError;
  };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'READ_WATERMARK',
      requestId,
      contactUrl,
    })) as typeof reply;
  } catch {
    throw storageAppError('Could not read sync progress.');
  }

  if (!reply || reply.type !== 'READ_WATERMARK' || reply.requestId !== requestId) {
    throw storageAppError('Unexpected reply while reading sync progress.');
  }
  if (!reply.ok) {
    throw reply.error ?? storageAppError('Could not read sync progress.');
  }
  if (!reply.data) {
    throw storageAppError('Unexpected reply while reading sync progress.');
  }

  const watermark = reply.data.watermark;
  if (watermark === null) {
    return null;
  }
  if (
    !isValidFingerprint(watermark.fingerprint) ||
    !Number.isFinite(watermark.syncedAtEpochMs)
  ) {
    throw storageAppError('Saved sync progress could not be read.');
  }
  if (
    watermark.lastMessageTimestampMs !== undefined &&
    (typeof watermark.lastMessageTimestampMs !== 'number' ||
      !Number.isFinite(watermark.lastMessageTimestampMs))
  ) {
    throw storageAppError('Saved sync progress could not be read.');
  }
  return watermark;
}
