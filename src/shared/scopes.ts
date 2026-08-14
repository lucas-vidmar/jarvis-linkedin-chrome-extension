export type ScopeId =
  | 'selected'
  | 'since-last-sync'
  | 'last-day'
  | 'last-week'
  | 'entire-thread';

export interface ScopeOption {
  id: ScopeId;
  label: string;
  caption: string;
}

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  { id: 'selected', label: 'Selected messages', caption: 'Pick messages by clicking them' },
  { id: 'since-last-sync', label: 'Since last sync', caption: 'New since your last sync' },
  { id: 'last-day', label: 'Last day', caption: 'Messages from the last 24 hours' },
  { id: 'last-week', label: 'Last week', caption: 'Messages from the last week' },
  { id: 'entire-thread', label: 'Entire thread', caption: 'All loaded messages' },
];

export function defaultScope(hasWatermark: boolean): ScopeId {
  return hasWatermark ? 'since-last-sync' : 'entire-thread';
}

export const THREAD_TRUNCATION_NOTE = 'thread truncated (only a window loaded)';

export function getScopeCaption(
  id: ScopeId,
  hasWatermark: boolean,
  threadTruncated = false,
): string {
  const option = SCOPE_OPTIONS.find((entry) => entry.id === id);
  if (!option) return '';
  if (id === 'since-last-sync' && !hasWatermark) {
    return `${option.caption} — first sync`;
  }
  if (id === 'entire-thread' && threadTruncated) {
    return `${option.caption} — ${THREAD_TRUNCATION_NOTE}`;
  }
  return option.caption;
}

export function isScopeEligible(id: ScopeId): boolean {
  return id !== 'selected';
}
