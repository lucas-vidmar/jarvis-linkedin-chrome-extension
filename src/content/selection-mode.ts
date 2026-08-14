import { SELECTORS, type ContactRef } from '@/content/detect-conversation';
import { extractMessagesWithRows } from '@/content/extract-messages';
import type { ComposerMessage } from '@/shared/composer';

const STYLE_ID = 'jarvis-selection-mode-styles';
const LIVE_REGION_ID = 'jarvis-selection-live-region';
const BAR_CLASS = 'jarvis-selection-bar';
const SELECTED_CLASS = 'jarvis-selection-selected';
const SCROLL_THROTTLE_MS = 150;

export interface SelectionModeOptions {
  threadRoot: HTMLElement;
  contact: ContactRef;
  onSync: (messages: ComposerMessage[]) => void | Promise<void>;
}

interface SelectionModeState {
  threadRoot: HTMLElement;
  contact: ContactRef;
  onSync: (messages: ComposerMessage[]) => void | Promise<void>;
  selected: Map<string, ComposerMessage>;
  rows: Map<HTMLElement, ComposerMessage>;
  markedRows: Set<HTMLElement>;
  originalTabIndex: WeakMap<HTMLElement, string | null>;
  refreshing: boolean;
  refreshPromise: Promise<void> | null;
  scrollTimer: ReturnType<typeof setTimeout> | undefined;
  bar: HTMLElement;
  label: HTMLElement;
  syncButton: HTMLButtonElement;
  liveRegion: HTMLElement;
  cleanup: () => void;
}

let active: SelectionModeState | null = null;

export function isSelectionModeActive(): boolean {
  return active !== null;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.${BAR_CLASS} {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 16px;
  z-index: 2147483002;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #ffffff;
  border: 1px solid #e9e9e9;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12);
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
  color: #191919;
}
.jarvis-selection-bar__label {
  font-weight: 600;
}
.jarvis-selection-bar__sync {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #ffffff;
  background: #0a66c2;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
}
.jarvis-selection-bar__sync:hover:not(:disabled) {
  background: #004182;
}
.jarvis-selection-bar__sync:focus-visible {
  outline: 2px solid #444ce7 !important;
  outline-offset: 2px !important;
}
.jarvis-selection-bar__sync:disabled {
  background: #0a66c2;
  opacity: 0.4;
  cursor: not-allowed;
}
.jarvis-selection-bar__cancel {
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: #0a66c2;
  background: none;
  border: none;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.jarvis-selection-bar__cancel:hover {
  background: #f3f2ef;
}
.jarvis-selection-bar__cancel:focus-visible {
  outline: 2px solid #444ce7 !important;
  outline-offset: 1px !important;
}
.msg-s-event-listitem.${SELECTED_CLASS} {
  box-shadow: inset 3px 0 0 0 #444ce7 !important;
}
.jarvis-selection-live-region {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
`;
  document.head.appendChild(style);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function closestMessageRow(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  for (const selector of SELECTORS.messageRows) {
    const row = target.closest<HTMLElement>(selector);
    if (row) return row;
  }
  return null;
}

function restoreRowMarkings(state: SelectionModeState, row: HTMLElement): void {
  row.classList.remove(SELECTED_CLASS);
  const original = state.originalTabIndex.get(row);
  if (original === undefined) return;
  if (original === null) {
    row.removeAttribute('tabindex');
  } else {
    row.setAttribute('tabindex', original);
  }
  state.originalTabIndex.delete(row);
}

function setRowSelected(row: HTMLElement, selected: boolean): void {
  row.classList.toggle(SELECTED_CLASS, selected);
}

function updateCount(state: SelectionModeState): void {
  const count = state.selected.size;
  const text = `Sync ${count} selected`;
  state.label.textContent = text;
  state.syncButton.textContent = text;
  state.syncButton.disabled = count === 0;
  state.liveRegion.textContent = `${count} message${count === 1 ? '' : 's'} selected`;
}

function applyHighlights(state: SelectionModeState): void {
  for (const [row, message] of state.rows) {
    setRowSelected(row, message.fingerprint !== null && state.selected.has(message.fingerprint));
  }
}

function refreshRows(state: SelectionModeState): Promise<void> {
  if (state.refreshing && state.refreshPromise) {
    return state.refreshPromise;
  }
  const run = (async () => {
    state.refreshing = true;
    let entries;
    try {
      entries = await extractMessagesWithRows(state.threadRoot, state.contact);
    } catch {
      return;
    } finally {
      state.refreshing = false;
      state.refreshPromise = null;
    }
    if (active !== state) return;
    const nextRows = new Map<HTMLElement, ComposerMessage>();
    const nextMarked = new Set<HTMLElement>();
    for (const { row, message } of entries) {
      nextRows.set(row, message);
      if (message.fingerprint === null) continue;
      if (!state.originalTabIndex.has(row)) {
        state.originalTabIndex.set(row, row.getAttribute('tabindex'));
      }
      row.tabIndex = 0;
      nextMarked.add(row);
    }
    for (const row of state.markedRows) {
      if (!nextMarked.has(row)) {
        restoreRowMarkings(state, row);
      }
    }
    state.rows = nextRows;
    state.markedRows = nextMarked;
    applyHighlights(state);
  })();
  state.refreshPromise = run;
  return run;
}

async function toggleRow(state: SelectionModeState, row: HTMLElement): Promise<void> {
  let entry = state.rows.get(row);
  if (entry === undefined) {
    await refreshRows(state);
    if (active !== state) return;
    entry = state.rows.get(row);
  }
  if (!entry) return;
  const fingerprint = entry.fingerprint;
  if (fingerprint === null) return;
  if (state.selected.has(fingerprint)) {
    state.selected.delete(fingerprint);
    setRowSelected(row, false);
  } else {
    state.selected.set(fingerprint, entry);
    setRowSelected(row, true);
  }
  updateCount(state);
}

export function exitSelectionMode(): void {
  const state = active;
  if (!state) return;
  active = null;
  state.cleanup();
  for (const row of state.markedRows) {
    restoreRowMarkings(state, row);
  }
  state.bar.remove();
  state.liveRegion.remove();
  removeStyles();
}

export function enterSelectionMode(options: SelectionModeOptions): void {
  if (active) return;
  ensureStyles();

  const bar = document.createElement('div');
  bar.className = BAR_CLASS;

  const label = document.createElement('span');
  label.className = 'jarvis-selection-bar__label';
  bar.appendChild(label);

  const syncButton = document.createElement('button');
  syncButton.type = 'button';
  syncButton.className = 'jarvis-selection-bar__sync';
  bar.appendChild(syncButton);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'jarvis-selection-bar__cancel';
  cancelButton.textContent = 'Cancel';
  bar.appendChild(cancelButton);

  const liveRegion = document.createElement('div');
  liveRegion.id = LIVE_REGION_ID;
  liveRegion.className = 'jarvis-selection-live-region';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');

  const state: SelectionModeState = {
    threadRoot: options.threadRoot,
    contact: options.contact,
    onSync: options.onSync,
    selected: new Map<string, ComposerMessage>(),
    rows: new Map<HTMLElement, ComposerMessage>(),
    markedRows: new Set<HTMLElement>(),
    originalTabIndex: new WeakMap<HTMLElement, string | null>(),
    refreshing: false,
    refreshPromise: null,
    scrollTimer: undefined,
    bar,
    label,
    syncButton,
    liveRegion,
    cleanup: () => {},
  };
  active = state;

  document.body.append(bar, liveRegion);

  syncButton.addEventListener('click', () => {
    if (state.selected.size === 0) return;
    const messages = Array.from(state.selected.values());
    exitSelectionMode();
    void Promise.resolve(state.onSync(messages)).catch(() => undefined);
  });

  cancelButton.addEventListener('click', () => {
    exitSelectionMode();
  });

  const onDocClick = (event: MouseEvent): void => {
    const row = closestMessageRow(event.target);
    if (!row) return;
    event.preventDefault();
    void toggleRow(state, row);
  };
  const onDocKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      exitSelectionMode();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = closestMessageRow(event.target);
    if (!row) return;
    event.preventDefault();
    void toggleRow(state, row);
  };
  const onDocScroll = (): void => {
    if (state.scrollTimer !== undefined) return;
    state.scrollTimer = setTimeout(() => {
      state.scrollTimer = undefined;
      if (active !== state) return;
      if (!state.threadRoot.isConnected) {
        exitSelectionMode();
        return;
      }
      void refreshRows(state);
    }, SCROLL_THROTTLE_MS);
  };

  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onDocKeyDown, true);
  document.addEventListener('scroll', onDocScroll, true);

  state.cleanup = () => {
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    document.removeEventListener('scroll', onDocScroll, true);
    if (state.scrollTimer !== undefined) {
      clearTimeout(state.scrollTimer);
      state.scrollTimer = undefined;
    }
  };

  updateCount(state);
  void refreshRows(state);
}
