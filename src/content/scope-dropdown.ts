import {
  SCOPE_OPTIONS,
  getScopeCaption,
  isScopeEligible,
  type ScopeId,
} from '@/shared/scopes';
import { countVisibleMessages } from '@/content/message-counter';

const STYLE_ID = 'jarvis-scope-dropdown-styles';
const PANEL_WIDTH = 280;
const EDGE_GAP = 8;
const ANCHOR_GAP = 8;
const Z_INDEX = 2147483000;

export interface ScopeDropdownOptions {
  anchor: HTMLElement;
  threadRoot: HTMLElement;
  selectedScope: ScopeId;
  messageCount: number;
  onSync: (scope: ScopeId, messageCount: number) => void;
  onCancel: () => void;
}

interface ActiveDropdown {
  panel: HTMLElement;
  cleanup: () => void;
}

let active: ActiveDropdown | null = null;
let repositionFrame = 0;

export function closeScopeDropdown(): void {
  if (!active) return;
  active.cleanup();
  active = null;
}

export function isScopeDropdownOpen(): boolean {
  return active !== null;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.jarvis-scope-dropdown {
  position: fixed;
  z-index: ${Z_INDEX};
  width: ${PANEL_WIDTH}px;
  max-width: calc(100vw - ${EDGE_GAP * 2}px);
  max-height: calc(100vh - ${EDGE_GAP * 2}px);
  overflow-y: auto;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #e9e9e9;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12);
  font-family: inherit;
  font-size: 14px;
  line-height: 20px;
  color: #191919;
  padding: 8px 0;
}
.jarvis-scope-dropdown__title {
  padding: 4px 16px 8px;
  font-weight: 600;
  font-size: 14px;
  line-height: 20px;
  color: #191919;
}
.jarvis-scope-dropdown__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
}
.jarvis-scope-dropdown__row:hover,
.jarvis-scope-dropdown__row[aria-checked="true"] {
  background: #f3f2ef;
}
.jarvis-scope-dropdown__row:focus {
  outline: 2px solid #444ce7 !important;
  outline-offset: -2px !important;
}
.jarvis-scope-dropdown__radio {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 3px;
  border: 1.5px solid #666666;
  border-radius: 50%;
  box-sizing: border-box;
}
.jarvis-scope-dropdown__row[aria-checked="true"] .jarvis-scope-dropdown__radio {
  border-color: #444ce7;
  background: radial-gradient(circle, #444ce7 0, #444ce7 4px, transparent 4.5px);
}
.jarvis-scope-dropdown__copy {
  display: block;
  min-width: 0;
}
.jarvis-scope-dropdown__label {
  display: block;
  font-weight: 600;
  color: #191919;
}
.jarvis-scope-dropdown__caption {
  display: block;
  font-size: 12px;
  line-height: 16px;
  color: #666666;
}
.jarvis-scope-dropdown__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 12px 16px 4px;
  border-top: 1px solid #e9e9e9;
}
.jarvis-scope-dropdown__hint {
  font-size: 12px;
  line-height: 16px;
  color: #666666;
}
.jarvis-scope-dropdown__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.jarvis-scope-dropdown__cancel {
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
.jarvis-scope-dropdown__cancel:hover {
  background: #f3f2ef;
}
.jarvis-scope-dropdown__cancel:focus-visible {
  outline: 2px solid #444ce7 !important;
  outline-offset: 1px !important;
}
.jarvis-scope-dropdown__confirm {
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
.jarvis-scope-dropdown__confirm:hover:not(:disabled) {
  background: #004182;
}
.jarvis-scope-dropdown__confirm:focus-visible {
  outline: 2px solid #444ce7 !important;
  outline-offset: 2px !important;
}
.jarvis-scope-dropdown__confirm:disabled {
  background: #0a66c2;
  opacity: 0.4;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: no-preference) {
  .jarvis-scope-dropdown {
    animation: jarvis-dropdown-in 160ms ease-out;
  }
}
@keyframes jarvis-dropdown-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
  document.head.appendChild(style);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function computeHint(scope: ScopeId, messageCount: number): string {
  if (!isScopeEligible(scope)) {
    return 'Selection arrives in a later story.';
  }
  if (messageCount === 0) {
    return 'No messages to sync yet.';
  }
  const unit = messageCount === 1 ? 'message' : 'messages';
  if (scope === 'today' || scope === 'last-24-hours' || scope === 'last-week') {
    return `${messageCount} ${unit} loaded in the thread`;
  }
  return `${messageCount} ${unit} will sync`;
}

function createRow(
  scope: (typeof SCOPE_OPTIONS)[number],
  checked: boolean,
  hasWatermark: boolean,
  onSelect: (scope: ScopeId) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'jarvis-scope-dropdown__row';
  row.setAttribute('role', 'radio');
  row.setAttribute('aria-checked', String(checked));
  row.tabIndex = checked ? 0 : -1;

  const radio = document.createElement('span');
  radio.className = 'jarvis-scope-dropdown__radio';
  radio.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'jarvis-scope-dropdown__copy';
  const label = document.createElement('span');
  label.className = 'jarvis-scope-dropdown__label';
  label.textContent = scope.label;
  const caption = document.createElement('span');
  caption.className = 'jarvis-scope-dropdown__caption';
  caption.textContent = getScopeCaption(scope.id, hasWatermark);
  copy.append(label, caption);

  row.append(radio, copy);
  row.addEventListener('click', () => {
    onSelect(scope.id);
    row.focus();
  });
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(scope.id);
    }
  });
  return row;
}

function positionPanel(panel: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  let left = rect.right - PANEL_WIDTH;
  if (left < EDGE_GAP) left = EDGE_GAP;
  if (left + PANEL_WIDTH > window.innerWidth - EDGE_GAP) {
    left = window.innerWidth - PANEL_WIDTH - EDGE_GAP;
  }
  if (left < EDGE_GAP) left = EDGE_GAP;

  panel.style.left = `${left}px`;
  panel.style.width = `${PANEL_WIDTH}px`;
  panel.style.top = `${rect.bottom + ANCHOR_GAP}px`;

  const height = panel.offsetHeight;
  if (rect.bottom + ANCHOR_GAP + height > window.innerHeight - EDGE_GAP) {
    let top = rect.top - height - ANCHOR_GAP;
    if (top < EDGE_GAP) top = EDGE_GAP;
    panel.style.top = `${top}px`;
  }
}

export function openScopeDropdown(options: ScopeDropdownOptions): void {
  closeScopeDropdown();
  ensureStyles();

  const panel = document.createElement('div');
  panel.className = 'jarvis-scope-dropdown';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'jarvis-scope-dropdown-title');

  const title = document.createElement('div');
  title.className = 'jarvis-scope-dropdown__title';
  title.id = 'jarvis-scope-dropdown-title';
  title.textContent = 'Sync to Jarvis';

  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Sync scope');

  let selectedScope = options.selectedScope;
  let messageCount = options.messageCount;
  const rows = new Map<ScopeId, HTMLElement>();

  const hint = document.createElement('span');
  hint.className = 'jarvis-scope-dropdown__hint';
  hint.textContent = computeHint(selectedScope, messageCount);

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'jarvis-scope-dropdown__confirm';
  confirmButton.textContent = 'Sync';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'jarvis-scope-dropdown__cancel';
  cancelButton.textContent = 'Cancel';

  function refresh(): void {
    const eligible = isScopeEligible(selectedScope) && messageCount >= 1;
    confirmButton.disabled = !eligible;
    hint.textContent = computeHint(selectedScope, messageCount);
    if (!eligible && document.activeElement === confirmButton) {
      rows.get(selectedScope)?.focus();
    }
  }

  function applySelection(scope: ScopeId): void {
    selectedScope = scope;
    for (const [id, row] of rows) {
      const isSelected = id === scope;
      row.setAttribute('aria-checked', String(isSelected));
      row.tabIndex = isSelected ? 0 : -1;
    }
    refresh();
  }

  for (const scope of SCOPE_OPTIONS) {
    const row = createRow(scope, scope.id === selectedScope, false, applySelection);
    rows.set(scope.id, row);
    group.appendChild(row);
  }
  refresh();

  const footer = document.createElement('div');
  footer.className = 'jarvis-scope-dropdown__footer';
  const actions = document.createElement('span');
  actions.className = 'jarvis-scope-dropdown__actions';
  actions.append(cancelButton, confirmButton);
  footer.append(hint, actions);

  panel.append(title, group, footer);
  document.body.appendChild(panel);
  positionPanel(panel, options.anchor);

  const radioRows = Array.from(rows.values());

  function focusRadioByIndex(index: number): void {
    const row = radioRows[index];
    if (!row) return;
    const scope = SCOPE_OPTIONS[index]?.id ?? SCOPE_OPTIONS[0].id;
    applySelection(scope);
    row.focus();
  }

  group.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    const currentIndex = radioRows.indexOf(target);
    if (currentIndex < 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRadioByIndex((currentIndex + 1) % radioRows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRadioByIndex((currentIndex - 1 + radioRows.length) % radioRows.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusRadioByIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusRadioByIndex(radioRows.length - 1);
    }
  });

  confirmButton.addEventListener('click', () => {
    if (options.anchor.isConnected) {
      options.anchor.focus();
    }
    options.onSync(selectedScope, messageCount);
  });

  cancelButton.addEventListener('click', () => {
    if (options.anchor.isConnected) {
      options.anchor.focus();
    }
    options.onCancel();
  });

  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!panel.contains(target) && !options.anchor.contains(target)) {
      closeScopeDropdown();
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (options.anchor.isConnected) {
        options.anchor.focus();
      }
      closeScopeDropdown();
    }
  };
  const onReposition = (): void => {
    if (repositionFrame !== 0) return;
    repositionFrame = requestAnimationFrame(() => {
      repositionFrame = 0;
      if (!active) return;
      if (!options.anchor.isConnected) {
        closeScopeDropdown();
        return;
      }
      positionPanel(active.panel, options.anchor);
      const nextCount = countVisibleMessages(options.threadRoot);
      if (nextCount !== messageCount) {
        messageCount = nextCount;
        refresh();
      }
    });
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition);

  options.anchor.setAttribute('aria-expanded', 'true');
  const focusedRow = rows.get(selectedScope);
  if (focusedRow) {
    focusedRow.focus();
  }

  active = {
    panel,
    cleanup: () => {
      if (repositionFrame !== 0) {
        cancelAnimationFrame(repositionFrame);
        repositionFrame = 0;
      }
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
      panel.remove();
      removeStyles();
      if (options.anchor.isConnected) {
        options.anchor.setAttribute('aria-expanded', 'false');
      }
    },
  };
}
