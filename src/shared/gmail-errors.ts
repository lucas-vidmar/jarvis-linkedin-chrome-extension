import type { AppError } from '@/shared/messages';

export type GmailSendErrorCode = 'AUTH_FAILED' | 'RATE_LIMITED' | 'SEND_FAILED';

export type GmailSendError = AppError & { code: GmailSendErrorCode };

interface ParsedGmailError {
  reasons: string[];
  status: string;
  message: string;
}

const RATE_LIMIT_REASONS = new Set([
  'ratelimitexceeded',
  'userratelimitexceeded',
  'dailylimitexceeded',
  'quotaexceeded',
  'resource_exhausted',
  'resourceexhausted',
]);

const AUTH_REASONS = new Set([
  'insufficientpermissions',
  'access_token_scope_insufficient',
  'access_token_expired',
  'invalid_grant',
  'unauthenticated',
  'permission_denied',
  'unauthorized',
  'forbidden',
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function parseGmailErrorBody(body: string): ParsedGmailError {
  const empty: ParsedGmailError = { reasons: [], status: '', message: '' };
  if (typeof body !== 'string' || body.trim() === '') return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Gmail occasionally returns an HTML or plain-text error page.
    return empty;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return empty;

  const error = (parsed as Record<string, unknown>).error;
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return empty;

  const record = error as Record<string, unknown>;
  const reasons: string[] = [];
  if (Array.isArray(record.errors)) {
    for (const entry of record.errors) {
      if (typeof entry !== 'object' || entry === null) continue;
      const reason = (entry as Record<string, unknown>).reason;
      if (typeof reason === 'string' && reason.trim() !== '') {
        reasons.push(reason.trim());
      }
    }
  }

  return {
    reasons,
    status: typeof record.status === 'string' ? record.status.trim() : '',
    message: typeof record.message === 'string' ? record.message.trim() : '',
  };
}

function detailFor(error: ParsedGmailError): string {
  return error.message || error.reasons[0] || '';
}

function authFailure(detail: string): GmailSendError {
  return {
    code: 'AUTH_FAILED',
    message: detail
      ? `Gmail rejected the send: ${detail}`
      : 'Google could not authorize the send. Reconnect to sync.',
    retryable: true,
  };
}

function rateLimited(): GmailSendError {
  return {
    code: 'RATE_LIMITED',
    message: 'Gmail is limiting how many messages can be sent right now. Try again shortly.',
    retryable: true,
  };
}

export function classifyGmailSendError(status: number, body: string): GmailSendError {
  const error = parseGmailErrorBody(body);
  const statusKey = normalize(error.status);
  const reasonKeys = error.reasons.map(normalize);
  const matches = (candidates: Set<string>): boolean =>
    candidates.has(statusKey) || reasonKeys.some((reason) => candidates.has(reason));

  if (status === 401) {
    return authFailure(detailFor(error));
  }

  if (status === 403) {
    if (matches(RATE_LIMIT_REASONS)) {
      return rateLimited();
    }
    if (matches(AUTH_REASONS)) {
      return authFailure(detailFor(error));
    }
    const detail = detailFor(error);
    return {
      code: 'SEND_FAILED',
      message: detail ? `Gmail rejected the send: ${detail}` : 'Gmail rejected the send.',
      retryable: false,
    };
  }

  if (status === 408 || status === 409 || status === 412 || status === 413 || status === 429) {
    return {
      code: 'SEND_FAILED',
      message: 'Gmail could not send the message. Try again shortly.',
      retryable: true,
    };
  }

  if (status >= 500) {
    return {
      code: 'SEND_FAILED',
      message: 'Gmail could not send the message.',
      retryable: true,
    };
  }

  return {
    code: 'SEND_FAILED',
    message: 'The message could not be sent.',
    retryable: false,
  };
}
