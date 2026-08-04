export type ScopeId =
  | 'selected'
  | 'today'
  | 'since-last-sync'
  | 'last-24-hours'
  | 'last-week'
  | 'entire-thread';

export interface ScopeOption {
  id: ScopeId;
  label: string;
  caption: string;
}

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  { id: 'selected', label: 'Selected messages', caption: 'Pick messages by clicking them' },
  { id: 'today', label: 'Today', caption: 'Messages sent today' },
  { id: 'since-last-sync', label: 'Since last sync', caption: 'New since your last sync' },
  { id: 'last-24-hours', label: 'Last 24 hours', caption: 'Messages from the last 24 hours' },
  { id: 'last-week', label: 'Last week', caption: 'Messages from the last week' },
  { id: 'entire-thread', label: 'Entire thread', caption: 'All loaded messages' },
];

export function defaultScope(hasWatermark: boolean): ScopeId {
  return hasWatermark ? 'since-last-sync' : 'entire-thread';
}

export function getScopeCaption(id: ScopeId, hasWatermark: boolean): string {
  const option = SCOPE_OPTIONS.find((entry) => entry.id === id);
  if (!option) return '';
  if (id === 'since-last-sync' && !hasWatermark) {
    return `${option.caption} — first sync`;
  }
  return option.caption;
}

export function isScopeEligible(id: ScopeId): boolean {
  return id !== 'selected';
}
