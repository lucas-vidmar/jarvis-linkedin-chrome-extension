import type { ComposerMessage } from '@/shared/composer';
import type { ScopeId } from '@/shared/scopes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TIME_SCOPES: readonly ScopeId[] = ['last-day', 'last-week'];

export function isTimeScope(scope: ScopeId): boolean {
  return TIME_SCOPES.includes(scope);
}

export function isResolvableScope(scope: ScopeId): boolean {
  return scope === 'since-last-sync' || isTimeScope(scope);
}

export interface ScopeFilterOptions {
  watermarkFingerprint?: string | null;
  watermarkTimestampMs?: number | null;
}

function isUsableTimestamp(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * "Since last sync" selection.
 *
 * Primary path: find the last message whose fingerprint matches the stored
 * watermark and keep everything after it. This is exact even when several
 * messages share the same millisecond timestamp.
 *
 * Fallback path: LinkedIn only keeps a window of a long thread in the DOM, so
 * the boundary message from the last sync may not be loaded anymore. The
 * watermark also records the timestamp of the newest message included in that
 * sync; when the fingerprint is absent we keep messages strictly newer than
 * that timestamp. This is a best-effort boundary:
 * - messages with exactly the watermark timestamp are excluded, because they
 *   are at least as likely to be the already-synced boundary itself as a new
 *   message;
 * - messages with no timestamp at all are kept conservatively, since the
 *   extension cannot prove they are old. Re-sending one message is preferable
 *   to dropping a real one.
 *
 * When neither the fingerprint nor a timestamp is usable (for example a
 * watermark written by an older version of the extension) the full loaded
 * thread is returned. That can re-send the loaded window, but silently
 * skipping messages is worse than an occasional duplicate.
 */
function filterSinceLastSync(
  messages: ComposerMessage[],
  watermarkFingerprint: string | null | undefined,
  watermarkTimestampMs: number | null | undefined,
): ComposerMessage[] {
  if (watermarkFingerprint) {
    const boundary = messages.findLastIndex(
      (message) => message.fingerprint === watermarkFingerprint,
    );
    if (boundary >= 0) {
      return messages.slice(boundary + 1);
    }
  }
  if (isUsableTimestamp(watermarkTimestampMs)) {
    return messages.filter(
      (message) =>
        message.timestampMs === null || message.timestampMs > watermarkTimestampMs,
    );
  }
  return messages;
}

function isWithinWindow(message: ComposerMessage, scope: ScopeId, now: Date): boolean {
  if (message.timestampMs === null) return true;
  const threshold =
    scope === 'last-day' ? now.getTime() - DAY_MS : now.getTime() - 7 * DAY_MS;
  return message.timestampMs > threshold && message.timestampMs <= now.getTime();
}

export function filterMessagesByScope(
  messages: ComposerMessage[],
  scope: ScopeId,
  now: Date,
  options: ScopeFilterOptions = {},
): ComposerMessage[] {
  if (scope === 'since-last-sync') {
    return filterSinceLastSync(
      messages,
      options.watermarkFingerprint,
      options.watermarkTimestampMs,
    );
  }
  if (!TIME_SCOPES.includes(scope)) return messages;
  return messages.filter((message) => isWithinWindow(message, scope, now));
}
