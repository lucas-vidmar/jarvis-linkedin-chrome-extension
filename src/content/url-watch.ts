/**
 * Shared URL-change watcher for content scripts.
 *
 * Content scripts run in an isolated world, so overriding `history.pushState`
 * / `history.replaceState` there does not intercept calls made by the page.
 * Instead we combine the events the browser does expose across worlds with a
 * low-frequency `location.href` poll as a safety net.
 */

export const DEFAULT_URL_POLL_INTERVAL_MS = 2_000;

const NAVIGATION_EVENTS = ['navigate', 'navigatesuccess'] as const;

export type UrlWatchTeardown = () => void;

export interface UrlWatchDeps {
  getHref: () => string;
  addWindowListener: (type: 'popstate' | 'hashchange', handler: () => void) => void;
  removeWindowListener: (type: 'popstate' | 'hashchange', handler: () => void) => void;
  navigation?: {
    addEventListener: (type: string, handler: () => void) => void;
    removeEventListener: (type: string, handler: () => void) => void;
  } | null;
  setInterval: (handler: () => void, timeoutMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

function resolveDeps(overrides: Partial<UrlWatchDeps>): UrlWatchDeps {
  const navigation =
    overrides.navigation !== undefined
      ? overrides.navigation
      : typeof window === 'undefined'
        ? null
        : (window as unknown as { navigation?: UrlWatchDeps['navigation'] }).navigation ?? null;

  return {
    getHref: overrides.getHref ?? (() => window.location.href),
    addWindowListener:
      overrides.addWindowListener ??
      ((type, handler) => window.addEventListener(type, handler)),
    removeWindowListener:
      overrides.removeWindowListener ??
      ((type, handler) => window.removeEventListener(type, handler)),
    navigation,
    setInterval:
      overrides.setInterval ?? ((handler, timeoutMs) => window.setInterval(handler, timeoutMs)),
    clearInterval:
      overrides.clearInterval ?? ((handle) => window.clearInterval(handle as number)),
  };
}

/**
 * Watch for URL changes (SPA navigations included) and invoke `onChange` with
 * the new href. The initial href is captured but never reported, so callers
 * keep their existing startup detection.
 *
 * Returns a teardown function that removes every listener and the poll timer.
 */
export function watchUrlChanges(
  onChange: (href: string) => void,
  overrides: Partial<UrlWatchDeps> = {},
  pollIntervalMs: number = DEFAULT_URL_POLL_INTERVAL_MS,
): UrlWatchTeardown {
  const deps = resolveDeps(overrides);
  let lastHref = deps.getHref();
  let stopped = false;

  const check = (): void => {
    if (stopped) return;
    const href = deps.getHref();
    if (href === lastHref) return;
    lastHref = href;
    onChange(href);
  };

  deps.addWindowListener('popstate', check);
  deps.addWindowListener('hashchange', check);
  for (const type of NAVIGATION_EVENTS) {
    deps.navigation?.addEventListener(type, check);
  }
  const interval = deps.setInterval(check, pollIntervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    deps.removeWindowListener('popstate', check);
    deps.removeWindowListener('hashchange', check);
    for (const type of NAVIGATION_EVENTS) {
      deps.navigation?.removeEventListener(type, check);
    }
    deps.clearInterval(interval);
  };
}
