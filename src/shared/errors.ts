export const BOUNCED = 'BOUNCED';

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
