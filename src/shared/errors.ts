export const BOUNCED = 'BOUNCED';

export type FailureReasonLabel = 'OAuth' | 'Send error' | 'Bounced' | 'Sync error';

export function failureReasonLabel(code: string): FailureReasonLabel {
  switch (code) {
    case 'AUTH_FAILED':
      return 'OAuth';
    case 'SEND_FAILED':
    case 'RATE_LIMITED':
      return 'Send error';
    case BOUNCED:
      return 'Bounced';
    default:
      return 'Sync error';
  }
}
