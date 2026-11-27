import type { ScopeId } from '@/shared/scopes';

export interface WatermarkValue {
  fingerprint: string;
  syncedAtEpochMs: number;
  /**
   * Timestamp of the newest message included in the last sync (composed
   * order). Optional because entries written by older versions of the
   * extension do not have it.
   *
   * `syncedAtEpochMs` is the compose time, not the last message time, so it
   * cannot be used as a boundary fallback.
   */
  lastMessageTimestampMs?: number;
}

/**
 * Scopes whose message set always ends at the current conversation boundary,
 * so the last synced message is a safe sync point.
 */
const ADVANCING_SCOPES: readonly ScopeId[] = ['entire-thread', 'since-last-sync'];

/**
 * Whether a successful send for this scope may advance the sync watermark.
 *
 * Only `entire-thread` and `since-last-sync` cover everything up to the newest
 * message. `selected` can skip messages between picks (A B C D, pick B and D
 * would skip C forever), and `last-day`/`last-week` stop at a time window, so
 * older un-synced messages would be skipped if the watermark moved to the
 * newest message in the window. Those scopes keep the previous watermark.
 *
 * A missing/unknown scope (for example a message from an older content script
 * during an extension update) also keeps the watermark where it was: not
 * advancing is recoverable, while advancing past un-synced messages is not.
 */
export function shouldAdvanceWatermark(scope: ScopeId | null | undefined): boolean {
  return scope !== null && scope !== undefined && ADVANCING_SCOPES.includes(scope);
}

export function watermarkStorageKey(contactUrl: string): string {
  return `watermark:${contactUrl}`;
}

export function isValidFingerprint(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
