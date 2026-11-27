import type { AppError } from '@/shared/messages';

export const BOUNCED = 'BOUNCED';
export const STORAGE_FAILED = 'STORAGE_FAILED';

/**
 * Raised when extension storage cannot be read or written.
 *
 * Callers must distinguish this from "nothing stored": a failed read is not a
 * missing watermark (which would trigger a full re-send) and not a reason to
 * fall back to the default sync recipient (which could misroute data).
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export function storageAppError(message: string): AppError {
  return { code: STORAGE_FAILED, message, retryable: true };
}

export type FailureReasonLabel = 'OAuth' | 'Send error' | 'Rate limit' | 'Bounced' | 'Sync error';

export function failureReasonLabel(code: string): FailureReasonLabel {
  switch (code) {
    case 'AUTH_FAILED':
      return 'OAuth';
    case 'SEND_FAILED':
      return 'Send error';
    case 'RATE_LIMITED':
      return 'Rate limit';
    case BOUNCED:
      return 'Bounced';
    default:
      return 'Sync error';
  }
}
