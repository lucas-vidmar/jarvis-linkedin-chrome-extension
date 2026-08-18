import { DEFAULT_SYNC_RECIPIENT } from '@/shared/recipient';
import type { GetSyncRecipientResult } from '@/shared/messages';

export async function readSyncRecipient(): Promise<string> {
  const requestId = crypto.randomUUID();

  let reply: {
    type: 'GET_SYNC_RECIPIENT';
    requestId: string;
    ok: boolean;
    data?: GetSyncRecipientResult;
  };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'GET_SYNC_RECIPIENT',
      requestId,
    })) as typeof reply;
  } catch {
    return DEFAULT_SYNC_RECIPIENT;
  }

  if (!reply || reply.type !== 'GET_SYNC_RECIPIENT' || reply.requestId !== requestId) {
    return DEFAULT_SYNC_RECIPIENT;
  }
  if (!reply.ok) {
    return DEFAULT_SYNC_RECIPIENT;
  }
  const value = reply.data?.recipient?.trim() ?? '';
  return value !== '' ? value : DEFAULT_SYNC_RECIPIENT;
}