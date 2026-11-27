import type { AppError, GetSyncRecipientResult } from '@/shared/messages';
import { storageAppError } from '@/shared/errors';

/**
 * Read the sync recipient from the background.
 *
 * Throws on a storage/transport failure. The default recipient is resolved in
 * the background only when nothing is stored; there is no local fallback here
 * because mailing to an unverified address is worse than aborting the send.
 */
export async function readSyncRecipient(): Promise<string> {
  const requestId = crypto.randomUUID();

  let reply: {
    type: 'GET_SYNC_RECIPIENT';
    requestId: string;
    ok: boolean;
    data?: GetSyncRecipientResult;
    error?: AppError;
  };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'GET_SYNC_RECIPIENT',
      requestId,
    })) as typeof reply;
  } catch {
    throw storageAppError('Could not read the saved sync recipient.');
  }

  if (!reply || reply.type !== 'GET_SYNC_RECIPIENT' || reply.requestId !== requestId) {
    throw storageAppError('Unexpected reply while reading the sync recipient.');
  }
  if (!reply.ok) {
    throw reply.error ?? storageAppError('Could not read the saved sync recipient.');
  }
  const value = reply.data?.recipient?.trim() ?? '';
  if (value === '') {
    throw storageAppError('The saved sync recipient could not be read.');
  }
  return value;
}
