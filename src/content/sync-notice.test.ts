// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissSyncNotices,
  showSyncError,
  showSyncInProgress,
  showSyncPrompt,
  showSyncSuccess,
} from '@/content/sync-notice';
import { resetDom } from '@/content/test-fixtures/linkedin-dom';

function notices(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-jarvis-sync-notice]'));
}

const STYLE_ID = 'jarvis-sync-notice-styles';

describe('sync notices', () => {
  beforeEach(() => {
    resetDom();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    resetDom();
  });

  it('renders an in-progress notice with a spinner and polite live region', () => {
    showSyncInProgress('Syncing to Jarvis…');

    const [notice] = notices();
    expect(notice).toBeDefined();
    expect(notice!.className).toBe('jarvis-sync-notice jarvis-sync-notice--pending');
    expect(notice!.getAttribute('role')).toBe('status');
    expect(notice!.getAttribute('aria-live')).toBe('polite');
    expect(notice!.querySelector('.jarvis-sync-notice__spinner')).not.toBeNull();
    expect(notice!.textContent).toContain('Syncing to Jarvis…');
    expect(notice!.style.left).toMatch(/px$/);
    expect(notice!.style.top).toMatch(/px$/);
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
  });

  it('renders an alert error notice with a dismiss action', () => {
    showSyncError('Could not sync.');

    const [notice] = notices();
    expect(notice!.className).toBe('jarvis-sync-notice jarvis-sync-notice--error');
    expect(notice!.getAttribute('role')).toBe('alert');
    expect(notice!.hasAttribute('aria-live')).toBe(false);
    expect(notice!.textContent).toContain('Could not sync.');

    const dismiss = notice!.querySelector<HTMLButtonElement>('button')!;
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss notification');
    expect(dismiss.textContent).toBe('×');
    expect(document.activeElement).toBe(dismiss);

    dismiss.click();
    expect(notices()).toHaveLength(0);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('renders caller-provided error actions before the dismiss action', () => {
    const retry = vi.fn();
    showSyncError('Could not sync.', [{ label: 'Retry', onActivate: retry }]);

    const buttons = Array.from(notices()[0]!.querySelectorAll('button'));
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Retry',
      'Dismiss notification',
    ]);

    buttons[0]!.click();
    expect(retry).toHaveBeenCalledTimes(1);
    // A custom action does not remove the notice.
    expect(notices()).toHaveLength(1);
  });

  it('renders prompt notices with each action wired to its handler', () => {
    showSyncPrompt('Already synced — what next?', [
      { label: 'Continue', onActivate: () => {} },
      { label: 'Start over', onActivate: () => {} },
    ]);

    const [notice] = notices();
    expect(notice!.className).toBe('jarvis-sync-notice jarvis-sync-notice--prompt');
    expect(notice!.getAttribute('role')).toBe('status');
    const buttons = Array.from(notice!.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Continue', 'Start over']);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('replaces an existing notice instead of stacking notices', () => {
    showSyncError('First failure.');
    expect(notices()).toHaveLength(1);

    showSyncPrompt('Second notice.', [{ label: 'OK', onActivate: () => {} }]);
    const current = notices();
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain('Second notice.');
    expect(current[0]!.textContent).not.toContain('First failure.');
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
  });

  it('auto-dismisses a success notice after the timeout', () => {
    vi.useFakeTimers();
    showSyncSuccess('Synced 3 messages.');

    expect(notices()).toHaveLength(1);
    expect(notices()[0]!.className).toBe('jarvis-sync-notice jarvis-sync-notice--success');
    expect(notices()[0]!.getAttribute('aria-live')).toBe('polite');

    vi.advanceTimersByTime(4_999);
    expect(notices()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(notices()).toHaveLength(0);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('cancels a pending success dismissal when another notice replaces it', () => {
    vi.useFakeTimers();
    showSyncSuccess('Synced.');
    showSyncError('Replaced.');

    expect(notices()).toHaveLength(1);
    vi.advanceTimersByTime(5_000);

    const [notice] = notices();
    expect(notice).toBeDefined();
    expect(notice!.textContent).toContain('Replaced.');
  });

  it('leaves error and prompt notices on screen until dismissed', () => {
    vi.useFakeTimers();
    showSyncError('Sticky failure.');
    vi.advanceTimersByTime(60_000);
    expect(notices()).toHaveLength(1);

    showSyncPrompt('Sticky prompt.', [{ label: 'OK', onActivate: () => {} }]);
    vi.advanceTimersByTime(60_000);
    expect(notices()).toHaveLength(1);
  });

  it('dismisses every notice and removes the injected styles', () => {
    showSyncError('Failure.');
    // Force a second notice to prove the bulk dismiss does not stop at one.
    const extra = document.createElement('div');
    extra.setAttribute('data-jarvis-sync-notice', '');
    document.body.append(extra);
    expect(notices()).toHaveLength(2);

    dismissSyncNotices();
    expect(notices()).toHaveLength(0);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });
});
