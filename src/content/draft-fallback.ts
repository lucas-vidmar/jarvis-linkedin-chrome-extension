import { composeComposeUrl, type JarvisEnvelope } from '@/shared/composer';
import type {
  AppError,
  ConfirmDraftSentResult,
  OpenDraftFallbackResult,
} from '@/shared/messages';

interface OpenDraftFallbackArgs {
  contactUrl: string;
  envelope: JarvisEnvelope;
}

interface ConfirmDraftSentArgs {
  contactUrl: string;
  syncId: string;
}

export async function openDraftFallback(args: OpenDraftFallbackArgs): Promise<OpenDraftFallbackResult> {
  const url = composeComposeUrl(args.envelope);
  const requestId = crypto.randomUUID();

  let reply: { type: 'OPEN_DRAFT_FALLBACK'; requestId: string; ok: boolean; data?: OpenDraftFallbackResult; error?: AppError };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'OPEN_DRAFT_FALLBACK',
      requestId,
      url,
    })) as typeof reply;
  } catch {
    throw {
      code: 'SEND_FAILED',
      message: 'Could not open the draft. Try again.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply || reply.type !== 'OPEN_DRAFT_FALLBACK' || reply.requestId !== requestId) {
    throw {
      code: 'SEND_FAILED',
      message: 'Unexpected reply from the extension.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply.ok || !reply.data || typeof reply.data.opened !== 'boolean' || !reply.data.opened) {
    throw (reply.error ?? {
      code: 'SEND_FAILED',
      message: 'Could not open the draft.',
      retryable: true,
    }) satisfies AppError;
  }

  return reply.data;
}

export async function confirmDraftSent(args: ConfirmDraftSentArgs): Promise<ConfirmDraftSentResult> {
  const requestId = crypto.randomUUID();

  let reply: { type: 'CONFIRM_DRAFT_SENT'; requestId: string; ok: boolean; data?: ConfirmDraftSentResult; error?: AppError };
  try {
    reply = (await chrome.runtime.sendMessage({
      type: 'CONFIRM_DRAFT_SENT',
      requestId,
      contactUrl: args.contactUrl,
      syncId: args.syncId,
    })) as typeof reply;
  } catch {
    throw {
      code: 'SEND_FAILED',
      message: 'Could not confirm the draft. Try again.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply || reply.type !== 'CONFIRM_DRAFT_SENT' || reply.requestId !== requestId) {
    throw {
      code: 'SEND_FAILED',
      message: 'Unexpected reply from the extension.',
      retryable: true,
    } satisfies AppError;
  }

  if (!reply.ok || !reply.data || typeof reply.data.confirmed !== 'boolean' || !reply.data.confirmed) {
    throw (reply.error ?? {
      code: 'SEND_FAILED',
      message: 'Could not confirm the draft.',
      retryable: true,
    }) satisfies AppError;
  }

  return reply.data;
}
