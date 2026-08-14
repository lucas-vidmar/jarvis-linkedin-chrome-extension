import type { ReadWatermarkResult } from '@/shared/messages';
import { isValidFingerprint } from '@/shared/watermark';
import type { WatermarkValue } from '@/shared/watermark';

export async function readWatermark(contactUrl: string): Promise<WatermarkValue | null> {
  const requestId = crypto.randomUUID();

  let reply: {
    type: 'READ_WATERMARK';
    requestId: string;
    ok: boolean;
    data?: ReadWatermarkResult;
  };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'READ_WATERMARK',
      requestId,
      contactUrl,
    })) as typeof reply;
  } catch {
    return null;
  }

  if (!reply || reply.type !== 'READ_WATERMARK' || reply.requestId !== requestId) {
    return null;
  }
  if (!reply.ok) {
    return null;
  }
  const watermark = reply.data?.watermark ?? null;
  if (watermark === null) {
    return null;
  }
  if (
    !isValidFingerprint(watermark.fingerprint) ||
    !Number.isFinite(watermark.syncedAtEpochMs)
  ) {
    return null;
  }
  return watermark;
}
