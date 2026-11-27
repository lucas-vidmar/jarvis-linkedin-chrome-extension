// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeScopeDropdown,
  isScopeDropdownOpen,
  openScopeDropdown,
  type ScopeDropdownOptions,
} from '@/content/scope-dropdown';
import { SCOPE_OPTIONS } from '@/shared/scopes';
import { renderThreadWithGroups, resetDom } from '@/content/test-fixtures/linkedin-dom';

const STYLE_ID = 'jarvis-scope-dropdown-styles';
const LABELS = SCOPE_OPTIONS.map((option) => option.label);

interface Mounted {
  root: HTMLElement;
  anchor: HTMLButtonElement;
}

function mount(rows: Array<{ text: string; time?: string; datetime?: string }> = []): Mounted {
  document.body.innerHTML = `
    <button type="button" class="jarvis-sync-scope">Sync to Jarvis</button>
    ${renderThreadWithGroups([{ header: 'Today', rows }])}
  `;
  const root = document.querySelector<HTMLElement>('.msg-thread');
  const anchor = document.querySelector<HTMLButtonElement>('.jarvis-sync-scope');
  if (!root || !anchor) throw new Error('fixture did not render');
  return { root, anchor };
}

interface OpenOverrides extends Partial<Omit<ScopeDropdownOptions, 'anchor' | 'threadRoot'>> {
  rows?: Parameters<typeof mount>[0];
}

function open(overrides: OpenOverrides = {}) {
  const { rows, ...optionOverrides } = overrides;
  const { root, anchor } = mount(rows);
  const options: ScopeDropdownOptions = {
    anchor,
    threadRoot: root,
    selectedScope: 'entire-thread',
    hasWatermark: true,
    messageCount: 3,
    onSync: vi.fn(),
    onCancel: vi.fn(),
    ...optionOverrides,
  };
  openScopeDropdown(options);
  const panel = document.querySelector<HTMLElement>('.jarvis-scope-dropdown');
  if (!panel) throw new Error('dropdown did not open');
  return { panel, anchor, root, options };
}

function panel(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.jarvis-scope-dropdown');
  if (!element) throw new Error('dropdown is not open');
  return element;
}

function rowElements(): HTMLElement[] {
  return Array.from(panel().querySelectorAll<HTMLElement>('.jarvis-scope-dropdown__row'));
}

function row(index: number): HTMLElement {
  const element = rowElements()[index];
  if (!element) throw new Error(`no row at ${index}`);
  return element;
}

function hint(): string {
  return panel().querySelector('.jarvis-scope-dropdown__hint')?.textContent ?? '';
}

function confirm(): HTMLButtonElement {
  return panel().querySelector<HTMLButtonElement>('.jarvis-scope-dropdown__confirm')!;
}

function cancel(): HTMLButtonElement {
  return panel().querySelector<HTMLButtonElement>('.jarvis-scope-dropdown__cancel')!;
}

function press(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function checkedRows(): string[] {
  return rowElements()
    .filter((element) => element.getAttribute('aria-checked') === 'true')
    .map((element) => element.textContent ?? '');
}

describe('scope dropdown', () => {
  beforeEach(() => {
    resetDom();
  });

  afterEach(() => {
    closeScopeDropdown();
    resetDom();
  });

  it('renders the scope rows with the current scope selected and focused', () => {
    const { panel: opened, anchor } = open({ selectedScope: 'since-last-sync', messageCount: 5 });

    expect(isScopeDropdownOpen()).toBe(true);
    expect(opened.getAttribute('role')).toBe('dialog');
    expect(opened.getAttribute('aria-modal')).toBe('false');
    expect(opened.textContent).toContain('Sync to Jarvis');
    expect(rowElements().map((element) => element.textContent)).toEqual([
      `${LABELS[0]}Pick messages by clicking them`,
      `${LABELS[1]}New since your last sync`,
      `${LABELS[2]}Messages from the last 24 hours`,
      `${LABELS[3]}Messages from the last week`,
      `${LABELS[4]}All loaded messages`,
    ]);
    expect(checkedRows()).toEqual([`${LABELS[1]}New since your last sync`]);
    expect(row(1).tabIndex).toBe(0);
    expect(row(0).tabIndex).toBe(-1);
    expect(document.activeElement).toBe(row(1));
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    expect(hint()).toBe('5 messages will sync');
  });

  it('labels first-sync and truncated-thread captions', () => {
    open({ selectedScope: 'entire-thread', hasWatermark: false, threadTruncated: true });

    expect(row(1).textContent).toContain('New since your last sync — first sync');
    expect(row(4).textContent).toContain(
      'All loaded messages — thread truncated (only a window loaded)',
    );
  });

  it('pluralizes the hint and disables confirm when there is nothing to sync', () => {
    open({ messageCount: 1 });
    expect(hint()).toBe('1 message will sync');
    expect(confirm().disabled).toBe(false);
    closeScopeDropdown();

    open({ messageCount: 0 });
    expect(hint()).toBe('No messages to sync yet.');
    expect(confirm().disabled).toBe(true);
  });

  it('keeps the manual-selection scope ineligible', () => {
    open({ selectedScope: 'selected', messageCount: 12 });

    expect(hint()).toBe('Pick messages by clicking them');
    expect(confirm().disabled).toBe(true);
  });

  it('moves the selection and focus with arrow, Home and End keys', () => {
    open({ selectedScope: 'last-day', messageCount: 5 });
    expect(document.activeElement).toBe(row(2));

    press(row(2), 'ArrowDown');
    expect(document.activeElement).toBe(row(3));
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[3])]);

    press(row(3), 'ArrowDown');
    expect(document.activeElement).toBe(row(4));

    // Wraps around to the first row.
    press(row(4), 'ArrowDown');
    expect(document.activeElement).toBe(row(0));
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[0])]);
    expect(hint()).toBe('Pick messages by clicking them');

    // Wraps backwards to the last row.
    press(row(0), 'ArrowUp');
    expect(document.activeElement).toBe(row(4));

    press(row(4), 'Home');
    expect(document.activeElement).toBe(row(0));

    press(row(0), 'End');
    expect(document.activeElement).toBe(row(4));
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[4])]);
  });

  it('activates rows with Enter, Space and click', () => {
    const { options } = open({ selectedScope: 'entire-thread', messageCount: 5 });

    press(row(2), 'Enter');
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[2])]);

    press(row(3), ' ');
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[3])]);

    row(4).click();
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[4])]);
    expect(document.activeElement).toBe(row(4));
    expect(options.onSync).not.toHaveBeenCalled();

    // Unrelated keys do not change the selection.
    press(row(1), 'Tab');
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[4])]);
  });

  it('delegates the manual-selection handoff to onSelectSelected', () => {
    const onSelectSelected = vi.fn();
    open({ selectedScope: 'entire-thread', messageCount: 5, onSelectSelected });

    row(0).click();

    expect(onSelectSelected).toHaveBeenCalledTimes(1);
    expect(checkedRows()).toEqual([expect.stringContaining(LABELS[4])]);
    expect(confirm().disabled).toBe(false);
  });

  it('resolves counts for counted scopes, caches them and uses the loaded count elsewhere', async () => {
    const counts: Record<string, number> = {
      'since-last-sync': 2,
      'last-day': 4,
      'last-week': 9,
      'entire-thread': 12,
    };
    const countForScope = vi.fn(async (scope: string) => counts[scope] ?? 0);

    open({ selectedScope: 'last-day', messageCount: 1, countForScope });
    expect(hint()).toBe('Counting messages…');

    await vi.waitFor(() => expect(hint()).toBe('4 messages will sync'));
    expect(confirm().disabled).toBe(false);

    press(row(2), 'ArrowDown');
    expect(row(3).getAttribute('aria-checked')).toBe('true');
    await vi.waitFor(() => expect(hint()).toBe('9 messages will sync'));

    press(row(3), 'End');
    // "Entire thread" is not a counted scope: it uses the loaded-row count.
    expect(row(4).getAttribute('aria-checked')).toBe('true');
    expect(hint()).toBe('1 message will sync');

    press(row(4), 'Home');
    expect(hint()).toBe('Pick messages by clicking them');
    expect(confirm().disabled).toBe(true);

    press(row(0), 'ArrowDown');
    await vi.waitFor(() => expect(hint()).toBe('2 messages will sync'));

    // Revisiting an already counted scope uses the cache.
    press(row(1), 'ArrowDown');
    await vi.waitFor(() => expect(hint()).toBe('4 messages will sync'));

    expect(countForScope.mock.calls.map((call) => call[0])).toEqual([
      'last-day',
      'last-week',
      'since-last-sync',
    ]);
  });

  it('disables confirm and explains when a scope count fails', async () => {
    const countForScope = vi.fn(async () => {
      throw new Error('no data');
    });

    open({ selectedScope: 'last-day', messageCount: 5, countForScope });

    await vi.waitFor(() =>
      expect(hint()).toBe("Couldn't read messages — reopen to try again."),
    );
    expect(confirm().disabled).toBe(true);
  });

  it('disables confirm when the resolved count is zero', async () => {
    open({ selectedScope: 'last-week', countForScope: async () => 0, messageCount: 5 });

    await vi.waitFor(() => expect(hint()).toBe('No messages to sync yet.'));
    expect(confirm().disabled).toBe(true);
  });

  it('syncs the selected scope, focuses the anchor and closes', async () => {
    const onSync = vi.fn();
    const { anchor, options } = open({ selectedScope: 'last-week', messageCount: 6, onSync });

    confirm().click();
    await Promise.resolve();

    expect(onSync).toHaveBeenCalledWith('last-week', 6);
    await vi.waitFor(() => expect(isScopeDropdownOpen()).toBe(false));
    expect(document.querySelector('.jarvis-scope-dropdown')).toBeNull();
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(anchor);
    expect(options.onCancel).not.toHaveBeenCalled();
  });

  it('shows pending state while syncing and closes even when onSync rejects', async () => {
    let rejectSync: ((error: Error) => void) | undefined;
    const onSync = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSync = reject;
        }),
    );
    open({ selectedScope: 'entire-thread', messageCount: 4, onSync });

    confirm().click();
    await Promise.resolve();

    expect(confirm().getAttribute('aria-busy')).toBe('true');
    expect(cancel().disabled).toBe(true);
    expect(panel().getAttribute('aria-busy')).toBe('true');
    expect(rowElements().every((element) => element.getAttribute('aria-disabled') === 'true')).toBe(
      true,
    );

    rejectSync!(new Error('sync failed'));
    await vi.waitFor(() => expect(isScopeDropdownOpen()).toBe(false));
  });

  it('closes on Escape and returns focus to the anchor without cancelling', async () => {
    const { anchor, options } = open();

    press(document, 'Escape');

    expect(isScopeDropdownOpen()).toBe(false);
    expect(document.querySelector('.jarvis-scope-dropdown')).toBeNull();
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(anchor);
    expect(options.onCancel).not.toHaveBeenCalled();
  });

  it('delegates cancel to onCancel and lets the owner close it', () => {
    const { anchor, options } = open();

    cancel().click();

    expect(options.onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor);
    expect(options.onSync).not.toHaveBeenCalled();

    closeScopeDropdown();
    expect(isScopeDropdownOpen()).toBe(false);
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('closes on an outside pointerdown but not on one inside the panel or anchor', () => {
    const { anchor } = open();

    panel().querySelector('.jarvis-scope-dropdown__title')!.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    );
    expect(isScopeDropdownOpen()).toBe(true);

    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(isScopeDropdownOpen()).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(isScopeDropdownOpen()).toBe(false);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });

  it('replaces an open dropdown instead of stacking panels', () => {
    const { anchor, root } = open({ messageCount: 2 });
    openScopeDropdown({
      anchor,
      threadRoot: root,
      selectedScope: 'entire-thread',
      hasWatermark: true,
      messageCount: 7,
      onSync: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(document.querySelectorAll('.jarvis-scope-dropdown')).toHaveLength(1);
    expect(hint()).toBe('7 messages will sync');
  });

  it('refreshes the visible count after the thread scrolls', async () => {
    const { root } = open({ messageCount: 0 });
    expect(confirm().disabled).toBe(true);
    expect(hint()).toBe('No messages to sync yet.');

    const list = root.querySelector('.msg-s-message-list__event')!;
    const row = document.createElement('div');
    row.className = 'msg-s-event-listitem';
    row.innerHTML = '<p class="msg-s-event-listitem__body">late message</p>';
    list.append(row);

    document.dispatchEvent(new Event('scroll', { bubbles: true }));

    await vi.waitFor(() => expect(hint()).toBe('1 message will sync'));
    expect(confirm().disabled).toBe(false);
  });
});
