import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWatermark } from '@/content/read-watermark';
import { readSyncRecipient } from '@/content/read-recipient';
import { DEFAULT_SYNC_RECIPIENT } from '@/shared/recipient';

const CONTACT_URL = 'https://www.linkedin.com/in/ada';

let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendMessage = vi.fn();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
  };
});

describe('content readWatermark', () => {
  it('throws instead of returning null when the background storage read fails', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'READ_WATERMARK',
      requestId: message.requestId,
      ok: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'Could not read sync progress.',
        retryable: true,
      },
    }));

    await expect(readWatermark(CONTACT_URL)).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
    });
  });

  it('throws when the message cannot reach the background', async () => {
    sendMessage.mockRejectedValue(new Error('disconnected'));

    await expect(readWatermark(CONTACT_URL)).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
    });
  });

  it('returns null only when the background reports no watermark', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'READ_WATERMARK',
      requestId: message.requestId,
      ok: true,
      data: { watermark: null },
    }));

    await expect(readWatermark(CONTACT_URL)).resolves.toBeNull();
  });

  it('returns a valid stored watermark', async () => {
    const watermark = { fingerprint: 'a'.repeat(64), syncedAtEpochMs: 1_700_000_000_000 };
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'READ_WATERMARK',
      requestId: message.requestId,
      ok: true,
      data: { watermark },
    }));

    await expect(readWatermark(CONTACT_URL)).resolves.toEqual(watermark);
  });

  it('throws when the background returns a corrupt watermark', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'READ_WATERMARK',
      requestId: message.requestId,
      ok: true,
      data: { watermark: { fingerprint: 'bad', syncedAtEpochMs: 1 } },
    }));

    await expect(readWatermark(CONTACT_URL)).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
    });
  });
});

describe('content readSyncRecipient', () => {
  it('throws instead of using the default when the background storage read fails', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'GET_SYNC_RECIPIENT',
      requestId: message.requestId,
      ok: false,
      error: {
        code: 'STORAGE_FAILED',
        message: 'Could not read the saved sync recipient.',
        retryable: true,
      },
    }));

    await expect(readSyncRecipient()).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
    });
  });

  it('throws when the message cannot reach the background', async () => {
    sendMessage.mockRejectedValue(new Error('disconnected'));

    await expect(readSyncRecipient()).rejects.toMatchObject({
      code: 'STORAGE_FAILED',
    });
  });

  it('uses the default recipient only when the background reports no stored value', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'GET_SYNC_RECIPIENT',
      requestId: message.requestId,
      ok: true,
      data: { recipient: DEFAULT_SYNC_RECIPIENT, isDefault: true },
    }));

    await expect(readSyncRecipient()).resolves.toBe(DEFAULT_SYNC_RECIPIENT);
  });

  it('returns the stored recipient', async () => {
    sendMessage.mockImplementation(async (message: { requestId: string }) => ({
      type: 'GET_SYNC_RECIPIENT',
      requestId: message.requestId,
      ok: true,
      data: { recipient: 'team@example.com', isDefault: false },
    }));

    await expect(readSyncRecipient()).resolves.toBe('team@example.com');
  });
});
