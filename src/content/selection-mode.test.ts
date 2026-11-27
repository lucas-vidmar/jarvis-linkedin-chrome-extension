// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enterSelectionMode,
  exitSelectionMode,
  isSelectionModeActive,
} from '@/content/selection-mode';
import { CONTACT_URL, renderThreadWithGroups, resetDom } from '@/content/test-fixtures/linkedin-dom';

const CONTACT = { contactName: 'Ada Lovelace', contactUrl: CONTACT_URL };
const BAR_CLASS = '.jarvis-selection-bar';
const STYLE_ID = 'jarvis-selection-mode-styles';
const LIVE_REGION_ID = 'jarvis-selection-live-region';

interface MountedThread {
  root: HTMLElement;
  rows: HTMLElement[];
}

function mountThread(): MountedThread {
  document.body.innerHTML = renderThreadWithGroups([
    {
      header: 'Today',
      rows: [
        { text: 'first message', time: '9:30 AM' },
        { text: 'second message', sender: 'contact', time: '9:31 AM' },
        { text: 'third message', time: '9:32 AM' },
      ],
    },
  ]);
  const root = document.querySelector<HTMLElement>('.msg-thread');
  if (!root) throw new Error('fixture did not render a thread root');
  return {
    root,
    rows: Array.from(root.querySelectorAll<HTMLElement>('.msg-s-event-listitem')),
  };
}

function click(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function keydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function waitForRowsMarked(rows: HTMLElement[]): Promise<void> {
  await vi.waitFor(() => {
    for (const row of rows) {
      expect(row.tabIndex).toBe(0);
    }
  });
}

function bar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(BAR_CLASS);
}

function label(): string {
  return bar()?.querySelector('.jarvis-selection-bar__label')?.textContent ?? '';
}

function syncButton(): HTMLButtonElement {
  return bar()!.querySelector<HTMLButtonElement>('.jarvis-selection-bar__sync')!;
}

describe('selection mode', () => {
  beforeEach(() => {
    resetDom();
  });

  afterEach(() => {
    exitSelectionMode();
    resetDom();
  });

  it('enters with a zero-count bar, a live region and selectable rows', async () => {
    const { root, rows } = mountThread();
    const onSync = vi.fn();

    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync });

    expect(isSelectionModeActive()).toBe(true);
    expect(bar()).not.toBeNull();
    expect(label()).toBe('Sync 0 selected');
    expect(syncButton().textContent).toBe('Sync 0 selected');
    expect(syncButton().disabled).toBe(true);
    const liveRegion = document.getElementById(LIVE_REGION_ID);
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.textContent).toBe('0 messages selected');
    expect(document.getElementById(STYLE_ID)).not.toBeNull();

    await waitForRowsMarked(rows);
  });

  it('toggles a row on click and keeps the count in sync', async () => {
    const { root, rows } = mountThread();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);

    click(rows[0]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
    expect(rows[0]!.classList.contains('jarvis-selection-selected')).toBe(true);
    expect(syncButton().disabled).toBe(false);
    expect(document.getElementById(LIVE_REGION_ID)?.textContent).toBe('1 message selected');

    click(rows[0]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 0 selected'));
    expect(rows[0]!.classList.contains('jarvis-selection-selected')).toBe(false);
    expect(syncButton().disabled).toBe(true);
    expect(document.getElementById(LIVE_REGION_ID)?.textContent).toBe('0 messages selected');
  });

  it('toggles the enclosing row when a descendant is clicked', async () => {
    const { root, rows } = mountThread();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);

    click(rows[1]!.querySelector('.msg-s-event-listitem__body')!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
    expect(rows[1]!.classList.contains('jarvis-selection-selected')).toBe(true);
  });

  it('toggles rows with Enter and Space but ignores unrelated keys', async () => {
    const { root, rows } = mountThread();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);

    keydown(rows[0]!, 'Enter');
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));

    keydown(rows[1]!, ' ');
    await vi.waitFor(() => expect(label()).toBe('Sync 2 selected'));

    keydown(rows[2]!, 'a');
    expect(label()).toBe('Sync 2 selected');

    keydown(rows[0]!, 'Enter');
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
  });

  it('syncs the selected messages in selection order and exits', async () => {
    const { root, rows } = mountThread();
    const onSync = vi.fn();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync });
    await waitForRowsMarked(rows);

    click(rows[2]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
    click(rows[0]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 2 selected'));

    syncButton().click();

    expect(onSync).toHaveBeenCalledTimes(1);
    const messages = onSync.mock.calls[0]![0] as Array<{ text: string; fingerprint: string }>;
    expect(messages.map((message) => message.text)).toEqual(['third message', 'first message']);
    expect(messages.every((message) => message.fingerprint.length === 64)).toBe(true);
    expect(isSelectionModeActive()).toBe(false);
    expect(bar()).toBeNull();
    expect(document.getElementById(LIVE_REGION_ID)).toBeNull();
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('does nothing on sync click when nothing is selected', async () => {
    const { root, rows } = mountThread();
    const onSync = vi.fn();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync });
    await waitForRowsMarked(rows);

    syncButton().click();

    expect(onSync).not.toHaveBeenCalled();
    expect(isSelectionModeActive()).toBe(true);
  });

  it('exits on Escape and restores row markings and tabindex', async () => {
    const { root, rows } = mountThread();
    rows[0]!.setAttribute('tabindex', '-1');
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);

    click(rows[0]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));

    keydown(document, 'Escape');

    expect(isSelectionModeActive()).toBe(false);
    expect(bar()).toBeNull();
    expect(rows[0]!.classList.contains('jarvis-selection-selected')).toBe(false);
    expect(rows[0]!.getAttribute('tabindex')).toBe('-1');
    expect(rows[1]!.hasAttribute('tabindex')).toBe(false);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('exits from the cancel button without syncing', async () => {
    const { root, rows } = mountThread();
    const onSync = vi.fn();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync });
    await waitForRowsMarked(rows);

    click(rows[0]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
    click(bar()!.querySelector('.jarvis-selection-bar__cancel')!);

    expect(onSync).not.toHaveBeenCalled();
    expect(isSelectionModeActive()).toBe(false);
    expect(bar()).toBeNull();
  });

  it('removes its document listeners on exit', async () => {
    const { root, rows } = mountThread();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);

    exitSelectionMode();
    click(rows[0]!);
    keydown(rows[0]!, 'Enter');

    expect(isSelectionModeActive()).toBe(false);
    expect(rows[0]!.classList.contains('jarvis-selection-selected')).toBe(false);
    expect(bar()).toBeNull();
  });

  it('ignores a second enter call while already active', async () => {
    const { root, rows } = mountThread();
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await waitForRowsMarked(rows);
    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });

    expect(document.querySelectorAll(BAR_CLASS)).toHaveLength(1);
  });

  it('leaves rows without a usable fingerprint unselectable', async () => {
    document.body.innerHTML = renderThreadWithGroups([
      { header: 'Today', rows: [{ text: 'no timestamp' }, { text: 'timed', time: '9:30 AM' }] },
    ]);
    const root = document.querySelector<HTMLElement>('.msg-thread')!;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('.msg-s-event-listitem'));

    enterSelectionMode({ threadRoot: root, contact: CONTACT, onSync: vi.fn() });
    await vi.waitFor(() => expect(rows[1]!.tabIndex).toBe(0));

    expect(rows[0]!.tabIndex).not.toBe(0);
    click(rows[0]!);
    await Promise.resolve();
    expect(label()).toBe('Sync 0 selected');

    click(rows[1]!);
    await vi.waitFor(() => expect(label()).toBe('Sync 1 selected'));
  });
});
