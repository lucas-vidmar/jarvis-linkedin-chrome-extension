import type { ComposerMessage } from '@/shared/composer';
import type { ScopeId } from '@/shared/scopes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TIME_SCOPES: readonly ScopeId[] = ['today', 'last-24-hours', 'last-week'];

export function isTimeScope(scope: ScopeId): boolean {
  return TIME_SCOPES.includes(scope);
}

export function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function isWithinWindow(message: ComposerMessage, scope: ScopeId, now: Date): boolean {
  if (message.timestampMs === null) return true;
  if (scope === 'today') {
    const start = startOfLocalDay(now);
    const nextDay = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
    return message.timestampMs >= start.getTime() && message.timestampMs < nextDay.getTime();
  }
  const threshold = scope === 'last-24-hours' ? now.getTime() - DAY_MS : now.getTime() - 7 * DAY_MS;
  return message.timestampMs > threshold && message.timestampMs <= now.getTime();
}

export function filterMessagesByScope(
  messages: ComposerMessage[],
  scope: ScopeId,
  now: Date,
): ComposerMessage[] {
  if (!TIME_SCOPES.includes(scope)) return messages;
  return messages.filter((message) => isWithinWindow(message, scope, now));
}
