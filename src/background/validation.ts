import { MAX_BODY_CHARS } from '@/shared/composer';
import {
  isRecipientAllowed,
  isValidRecipient,
  resolveAllowedRecipientDomain,
} from '@/shared/recipient';
import { isValidFingerprint } from '@/shared/watermark';

/** RFC 5322 caps a header line at 998 characters. */
export const MAX_SUBJECT_CHARS = 998;

export const LINKEDIN_CONTACT_HOST = 'www.linkedin.com';
export const GMAIL_COMPOSE_HOST = 'mail.google.com';
export const GMAIL_COMPOSE_PATH_PREFIX = '/mail/';

export type SyncEmailValidationFailure =
  | 'contact-url'
  | 'sync-id'
  | 'envelope'
  | 'recipient'
  | 'recipient-domain'
  | 'subject'
  | 'body'
  | 'fingerprint'
  | 'composed-at'
  | 'last-message-timestamp';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: SyncEmailValidationFailure };

const OK: ValidationResult = { ok: true };

function reject(reason: SyncEmailValidationFailure): ValidationResult {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A LinkedIn conversation URL is the only resource the background is allowed
 * to key watermarks and in-flight sends by, so it must be a real
 * `https://www.linkedin.com/...` URL (not a lookalike host, not another scheme).
 */
export function isAllowedLinkedInContactUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === LINKEDIN_CONTACT_HOST &&
    parsed.port === '' &&
    parsed.pathname.startsWith('/')
  );
}

/**
 * The draft fallback opens a Gmail compose URL in a new tab. Parse it instead
 * of trusting a prefix so hosts such as `mail.google.com.evil.test` and paths
 * outside `/mail/` are rejected.
 */
export function isAllowedGmailComposeUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === GMAIL_COMPOSE_HOST &&
    parsed.port === '' &&
    parsed.pathname.startsWith(GMAIL_COMPOSE_PATH_PREFIX)
  );
}

/**
 * Validate an untrusted `SEND_SYNC_EMAIL` request before any Gmail call.
 *
 * `allowedRecipientDomain` defaults to the build-time
 * `WXT_ALLOWED_RECIPIENT_DOMAIN`; passing `null` disables the allowlist.
 * Failures are intentionally opaque so callers never echo envelope contents.
 */
export function validateSendSyncEmailRequest(
  message: unknown,
  allowedRecipientDomain: string | null = resolveAllowedRecipientDomain(),
): ValidationResult {
  if (!isRecord(message)) return reject('envelope');

  if (!isAllowedLinkedInContactUrl(message.contactUrl)) return reject('contact-url');

  const syncId = message.syncId;
  if (typeof syncId !== 'string' || syncId.trim() === '') return reject('sync-id');

  const envelope = message.envelope;
  if (!isRecord(envelope)) return reject('envelope');

  const to = envelope.to;
  if (typeof to !== 'string' || !isValidRecipient(to)) return reject('recipient');
  if (!isRecipientAllowed(to.trim(), allowedRecipientDomain)) {
    return reject('recipient-domain');
  }

  const subject = envelope.subject;
  if (
    typeof subject !== 'string' ||
    subject.trim() === '' ||
    subject.length > MAX_SUBJECT_CHARS
  ) {
    return reject('subject');
  }

  const body = envelope.body;
  if (typeof body !== 'string' || body.trim() === '' || body.length > MAX_BODY_CHARS) {
    return reject('body');
  }

  const fingerprint = envelope.lastMessageFingerprint;
  if (
    fingerprint !== null &&
    !(typeof fingerprint === 'string' && isValidFingerprint(fingerprint))
  ) {
    return reject('fingerprint');
  }

  const composedAtEpochMs = envelope.composedAtEpochMs;
  if (
    typeof composedAtEpochMs !== 'number' ||
    !Number.isFinite(composedAtEpochMs)
  ) {
    return reject('composed-at');
  }

  const lastMessageTimestampMs = envelope.lastMessageTimestampMs;
  if (
    lastMessageTimestampMs !== null &&
    (typeof lastMessageTimestampMs !== 'number' ||
      !Number.isFinite(lastMessageTimestampMs))
  ) {
    return reject('last-message-timestamp');
  }

  const truncated = envelope.truncated;
  const omittedCount = envelope.omittedCount;
  if (
    typeof truncated !== 'boolean' ||
    typeof omittedCount !== 'number' ||
    !Number.isInteger(omittedCount) ||
    omittedCount < 0
  ) {
    return reject('envelope');
  }

  return OK;
}
