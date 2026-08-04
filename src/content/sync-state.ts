import type { ScopeId } from '@/shared/scopes';

let pendingScope: ScopeId | null = null;

export function setPendingScope(scope: ScopeId | null): void {
  pendingScope = scope;
}

export function getPendingScope(): ScopeId | null {
  return pendingScope;
}
