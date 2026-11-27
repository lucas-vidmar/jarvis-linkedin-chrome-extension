import { describe, expect, it, vi } from 'vitest';
import { TimeoutError, withTimeout } from '@/content/with-timeout';

describe('withTimeout', () => {
  it('resolves with the promise value when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1_000)).resolves.toBe('done');
  });

  it('passes through the original rejection', async () => {
    const failure = new Error('boom');
    await expect(withTimeout(Promise.reject(failure), 1_000)).rejects.toBe(failure);
  });

  it('rejects with a TimeoutError when the promise never settles', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<string>(() => undefined);
      const result = withTimeout(pending, 5_000);
      const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports the timeout duration and a custom message', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<string>(() => undefined);
      const result = withTimeout(pending, 50, 'background did not answer');
      const assertion = expect(result).rejects.toMatchObject({
        name: 'TimeoutError',
        timeoutMs: 50,
        message: 'background did not answer',
      });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
