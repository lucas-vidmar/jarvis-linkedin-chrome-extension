import type { ScopeId } from '@/shared/scopes';
import type { JarvisEnvelope } from '@/shared/composer';

let pendingScope: ScopeId | null = null;
let pendingEnvelope: JarvisEnvelope | null = null;

export function setPendingScope(scope: ScopeId | null): void {
  pendingScope = scope;
}

export function getPendingScope(): ScopeId | null {
  return pendingScope;
}

export function setPendingEnvelope(envelope: JarvisEnvelope | null): void {
  pendingEnvelope = envelope;
}

export function getPendingEnvelope(): JarvisEnvelope | null {
  return pendingEnvelope;
}
