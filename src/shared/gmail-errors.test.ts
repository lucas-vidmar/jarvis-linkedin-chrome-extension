import { describe, expect, it } from 'vitest';
import { classifyGmailSendError } from '@/shared/gmail-errors';

function gmailError(error: Record<string, unknown>): string {
  return JSON.stringify({ error });
}

function withReason(reason: string): string {
  return gmailError({
    code: 403,
    message: 'The caller does not have permission',
    errors: [{ message: 'The caller does not have permission', domain: 'global', reason }],
    status: 'PERMISSION_DENIED',
  });
}

describe('classifyGmailSendError', () => {
  it.each([
    'rateLimitExceeded',
    'userRateLimitExceeded',
    'dailyLimitExceeded',
    'quotaExceeded',
  ])('classifies a 403 with %s as RATE_LIMITED', (reason) => {
    const result = classifyGmailSendError(
      403,
      gmailError({
        code: 403,
        message: 'Rate limit exceeded',
        errors: [{ message: 'Rate limit exceeded', domain: 'usageLimits', reason }],
        status: 'RESOURCE_EXHAUSTED',
      }),
    );

    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
    expect(result.message).toMatch(/try again shortly/i);
  });

  it('classifies a 403 with the RESOURCE_EXHAUSTED status as RATE_LIMITED', () => {
    const result = classifyGmailSendError(
      403,
      gmailError({ code: 403, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' }),
    );

    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
  });

  it('classifies a 403 with insufficientPermissions as AUTH_FAILED', () => {
    const result = classifyGmailSendError(403, withReason('insufficientPermissions'));

    expect(result.code).toBe('AUTH_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('classifies a 403 with ACCESS_TOKEN_SCOPE_INSUFFICIENT as AUTH_FAILED', () => {
    const result = classifyGmailSendError(403, withReason('ACCESS_TOKEN_SCOPE_INSUFFICIENT'));

    expect(result.code).toBe('AUTH_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('classifies an auth status on a 403 as AUTH_FAILED', () => {
    const result = classifyGmailSendError(
      403,
      gmailError({ code: 403, message: 'Unauthenticated', status: 'UNAUTHENTICATED' }),
    );

    expect(result.code).toBe('AUTH_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('classifies an unknown 403 reason as a non-retryable SEND_FAILED', () => {
    const result = classifyGmailSendError(
      403,
      gmailError({
        code: 403,
        message: 'Request failed',
        errors: [{ message: 'Request failed', domain: 'global', reason: 'someOtherFailure' }],
        status: 'FAILED_PRECONDITION',
      }),
    );

    expect(result.code).toBe('SEND_FAILED');
    expect(result.retryable).toBe(false);
  });

  it('classifies a 401 as AUTH_FAILED', () => {
    const result = classifyGmailSendError(
      401,
      gmailError({
        code: 401,
        message: 'Request had invalid authentication credentials.',
        errors: [{ message: 'Invalid Credentials', domain: 'global', reason: 'authError' }],
        status: 'UNAUTHENTICATED',
      }),
    );

    expect(result.code).toBe('AUTH_FAILED');
    expect(result.retryable).toBe(true);
    expect(result.message).toContain('Request had invalid authentication credentials.');
  });

  it('keeps a 429 retryable as SEND_FAILED', () => {
    const result = classifyGmailSendError(429, gmailError({ code: 429, message: 'Too many requests' }));

    expect(result.code).toBe('SEND_FAILED');
    expect(result.retryable).toBe(true);
    expect(result.message).toMatch(/try again shortly/i);
  });

  it.each([408, 409, 412, 413])('keeps a %i retryable as SEND_FAILED', (status) => {
    const result = classifyGmailSendError(status, '');

    expect(result.code).toBe('SEND_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('keeps a 500 retryable as SEND_FAILED', () => {
    const result = classifyGmailSendError(500, gmailError({ code: 500, message: 'Backend Error' }));

    expect(result.code).toBe('SEND_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('handles a non-JSON body without throwing', () => {
    const result = classifyGmailSendError(403, '<html><body>Forbidden</body></html>');

    expect(result.code).toBe('SEND_FAILED');
    expect(result.retryable).toBe(false);
    expect(result.message).toBe('Gmail rejected the send.');
  });

  it('handles a JSON body with no errors array', () => {
    const result = classifyGmailSendError(
      403,
      gmailError({ code: 403, message: 'Forbidden', status: 'PERMISSION_DENIED' }),
    );

    expect(result.code).toBe('AUTH_FAILED');
    expect(result.retryable).toBe(true);
  });

  it('handles malformed error payloads defensively', () => {
    expect(classifyGmailSendError(403, 'null').code).toBe('SEND_FAILED');
    expect(classifyGmailSendError(403, '{"error":{"code":403,"errors":null}}').code).toBe(
      'SEND_FAILED',
    );
    expect(classifyGmailSendError(403, '{"error":{"errors":[null,{"reason":42},"nope"]}}').code).toBe(
      'SEND_FAILED',
    );
    expect(classifyGmailSendError(403, '[]').code).toBe('SEND_FAILED');
  });
});
