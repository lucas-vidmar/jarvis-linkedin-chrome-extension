import { composeComposeUrl, type JarvisEnvelope } from '@/shared/composer';
import type { ScopeId } from '@/shared/scopes';
import type {
  AppError,
  ConfirmDraftSentResult,
  OpenDraftFallbackResult,
} from '@/shared/messages';
import { TimeoutError, withTimeout } from '@/content/with-timeout';

/** Gmail accepts long compose URLs, but browsers/tabs reliably handle ~8k. */
export const MAX_COMPOSE_URL_LENGTH = 8_000;
export const OPEN_DRAFT_TIMEOUT_MS = 10_000;
export const CONFIRM_DRAFT_TIMEOUT_MS = 10_000;

export function isComposeUrlWithinLimit(
  url: string,
  maxLength: number = MAX_COMPOSE_URL_LENGTH,
): boolean {
  return url.length <= maxLength;
}

export function composeUrlTooLongError(): AppError {
  return {
    code: 'SEND_FAILED',
    message:
      'The draft is too long to open in Gmail. Choose a smaller scope and try again.',
    retryable: false,
  };
}

interface OpenDraftFallbackArgs {
  contactUrl: string;
  envelope: JarvisEnvelope;
}

interface ConfirmDraftSentArgs {
  contactUrl: string;
  syncId: string;
  lastMessageFingerprint: string | null;
  lastMessageTimestampMs: number | null;
  composedAtEpochMs: number;
  scope: ScopeId;
}

export async function openDraftFallback(args: OpenDraftFallbackArgs): Promise<OpenDraftFallbackResult> {
  const url = composeComposeUrl(args.envelope);
  if (!isComposeUrlWithinLimit(url)) {
    throw composeUrlTooLongError();
  }
  const requestId = crypto.randomUUID();

  let reply: { type: 'OPEN_DRAFT_FALLBACK'; requestId: string; ok: boolean; data?: OpenDraftFallbackResult; error?: AppError };
  try {
    reply = (await withTimeout(
      chrome.runtime.sendMessage({
        type: 'OPEN_DRAFT_FALLBACK',
        requestId,
        url,
      }) as Promise<typeof reply>,
      OPEN_DRAFT_TIMEOUT_MS,
    )) as typeof reply;
  } catch (error) {
    throw {
      code: 'SEND_FAILED',
      message:
        error instanceof TimeoutError
          ? 'Timed out opening the draft. Try again.'
          : 'Could not open the draft. Try again.',
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
    reply = (await withTimeout(
      chrome.runtime.sendMessage({
        type: 'CONFIRM_DRAFT_SENT',
        requestId,
        contactUrl: args.contactUrl,
        syncId: args.syncId,
        lastMessageFingerprint: args.lastMessageFingerprint,
        lastMessageTimestampMs: args.lastMessageTimestampMs,
        composedAtEpochMs: args.composedAtEpochMs,
        scope: args.scope,
      }) as Promise<typeof reply>,
      CONFIRM_DRAFT_TIMEOUT_MS,
    )) as typeof reply;
  } catch (error) {
    throw {
      code: 'SEND_FAILED',
      message:
        error instanceof TimeoutError
          ? 'Timed out confirming the draft. Try again.'
          : 'Could not confirm the draft. Try again.',
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
