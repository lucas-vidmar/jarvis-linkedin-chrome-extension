import type { ComposerMessage } from '@/shared/composer';
import type { ScopeId } from '@/shared/scopes';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const TIME_SCOPES: readonly ScopeId[] = ['last-day', 'last-week'];

export function isTimeScope(scope: ScopeId): boolean {
  return TIME_SCOPES.includes(scope);
}

function isWithinWindow(message: ComposerMessage, scope: ScopeId, now: Date): boolean {
  if (message.timestampMs === null) return true;
  const threshold =
    scope === 'last-day' ? now.getTime() - DAY_MS : now.getTime() - 7 * DAY_MS;
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
