import type {
  AppError,
  SendSyncEmailResult,
  SyncEmailReply,
} from '@/shared/messages';
import type { JarvisEnvelope } from '@/shared/composer';
import type { ScopeId } from '@/shared/scopes';
import { TimeoutError, withTimeout } from '@/content/with-timeout';

/**
 * Slightly above the background's 30s Gmail send timeout, so the background
 * still gets to report its own failure/result first.
 */
export const SEND_SYNC_TIMEOUT_MS = 35_000;

interface SendSyncEmailArgs {
  contactUrl: string;
  envelope: JarvisEnvelope;
  scope: ScopeId;
}

export async function sendSyncEmail(args: SendSyncEmailArgs): Promise<SendSyncEmailResult> {
  const requestId = crypto.randomUUID();
  const syncId = crypto.randomUUID();

  let reply: SyncEmailReply;
  try {
    reply = (await withTimeout(
      chrome.runtime.sendMessage({
        type: 'SEND_SYNC_EMAIL',
        requestId,
        syncId,
        contactUrl: args.contactUrl,
        envelope: args.envelope,
        scope: args.scope,
      }) as Promise<SyncEmailReply>,
      SEND_SYNC_TIMEOUT_MS,
    )) as SyncEmailReply;
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw {
        code: 'SEND_FAILED',
        message: 'Timed out waiting for the extension background. Try again.',
        retryable: true,
      } satisfies AppError;
    }
    throw {
      code: 'SEND_FAILED',
      message: 'Could not reach the extension background.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply || reply.type !== 'SEND_SYNC_EMAIL' || reply.requestId !== requestId) {
    throw {
      code: 'SEND_FAILED',
      message: 'Unexpected reply from the extension.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply.ok) {
    throw reply.error as AppError;
  }

  if (!reply.data || typeof reply.data.messageId !== 'string' || !reply.data.messageId) {
    throw {
      code: 'SEND_FAILED',
      message: 'Gmail did not return a message id.',
      retryable: false,
    } satisfies AppError;
  }

  return reply.data;
}
