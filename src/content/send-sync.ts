import type {
  AppError,
  SendSyncEmailResult,
  SyncEmailReply,
} from '@/shared/messages';
import type { JarvisEnvelope } from '@/shared/composer';

interface SendSyncEmailArgs {
  contactUrl: string;
  envelope: JarvisEnvelope;
}

export async function sendSyncEmail(args: SendSyncEmailArgs): Promise<SendSyncEmailResult> {
  const requestId = crypto.randomUUID();
  const syncId = crypto.randomUUID();

  let reply: SyncEmailReply;
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'SEND_SYNC_EMAIL',
      requestId,
      syncId,
      contactUrl: args.contactUrl,
      envelope: args.envelope,
    })) as SyncEmailReply;
  } catch {
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
