import { describe, expect, it, vi } from 'vitest';
import { watchUrlChanges, type UrlWatchDeps } from '@/content/url-watch';

function createHarness(initialHref: string) {
  let href = initialHref;
  let nextIntervalId = 1;
  const windowListeners = new Map<string, Set<() => void>>();
  const navigationListeners = new Map<string, Set<() => void>>();
  const intervals = new Map<number, () => void>();

  const addTo = (store: Map<string, Set<() => void>>, type: string, handler: () => void) => {
    const handlers = store.get(type) ?? new Set<() => void>();
    handlers.add(handler);
    store.set(type, handlers);
  };
  const removeFrom = (store: Map<string, Set<() => void>>, type: string, handler: () => void) => {
    store.get(type)?.delete(handler);
  };

  const deps: UrlWatchDeps = {
    getHref: () => href,
    addWindowListener: (type, handler) => addTo(windowListeners, type, handler),
    removeWindowListener: (type, handler) => removeFrom(windowListeners, type, handler),
    navigation: {
      addEventListener: (type, handler) => addTo(navigationListeners, type, handler),
      removeEventListener: (type, handler) => removeFrom(navigationListeners, type, handler),
    },
    setInterval: (handler) => {
      const id = nextIntervalId++;
      intervals.set(id, handler);
      return id;
    },
    clearInterval: (handle) => {
      intervals.delete(handle as number);
    },
  };

  const dispatch = (store: Map<string, Set<() => void>>, type: string) => {
    for (const handler of [...(store.get(type) ?? [])]) handler();
  };
  const poll = () => {
    for (const handler of [...intervals.values()]) handler();
  };

  return {
    deps,
    setHref: (next: string) => {
      href = next;
    },
    dispatchWindow: (type: 'popstate' | 'hashchange') => dispatch(windowListeners, type),
    dispatchNavigation: (type: string) => dispatch(navigationListeners, type),
    poll,
    windowListenerCount: () =>
      [...windowListeners.values()].reduce((total, handlers) => total + handlers.size, 0),
    navigationListenerCount: () =>
      [...navigationListeners.values()].reduce((total, handlers) => total + handlers.size, 0),
    intervalCount: () => intervals.size,
  };
}

describe('watchUrlChanges', () => {
  it('does not report the initial href and reports a polled change exactly once', () => {
    const harness = createHarness('https://www.linkedin.com/feed/');
    const onChange = vi.fn();
    const stop = watchUrlChanges(onChange, harness.deps);

    harness.poll();
    expect(onChange).not.toHaveBeenCalled();

    harness.setHref('https://www.linkedin.com/in/ada/');
    harness.poll();
    harness.poll();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('https://www.linkedin.com/in/ada/');
    stop();
  });

  it('reports popstate and hashchange only when the href actually changed', () => {
    const harness = createHarness('https://www.linkedin.com/in/ada/');
    const onChange = vi.fn();
    const stop = watchUrlChanges(onChange, harness.deps);

    harness.dispatchWindow('popstate');
    expect(onChange).not.toHaveBeenCalled();

    harness.setHref('https://www.linkedin.com/in/ada/#experience');
    harness.dispatchWindow('hashchange');
    expect(onChange).toHaveBeenCalledTimes(1);

    harness.setHref('https://www.linkedin.com/in/grace/');
    harness.dispatchWindow('popstate');
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('uses the Navigation API events when available', () => {
    const harness = createHarness('https://crm.zoho.com/crm/org1/tab/Contacts');
    const onChange = vi.fn();
    const stop = watchUrlChanges(onChange, harness.deps);

    harness.setHref('https://crm.zoho.com/crm/org1/tab/Contacts/123');
    harness.dispatchNavigation('navigatesuccess');

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('tears down window/navigation listeners and the poll timer', () => {
    const harness = createHarness('https://www.linkedin.com/feed/');
    const onChange = vi.fn();
    const stop = watchUrlChanges(onChange, harness.deps);

    expect(harness.windowListenerCount()).toBe(2);
    expect(harness.navigationListenerCount()).toBe(2);
    expect(harness.intervalCount()).toBe(1);

    stop();

    expect(harness.windowListenerCount()).toBe(0);
    expect(harness.navigationListenerCount()).toBe(0);
    expect(harness.intervalCount()).toBe(0);

    harness.setHref('https://www.linkedin.com/in/ada/');
    harness.poll();
    harness.dispatchWindow('popstate');
    harness.dispatchNavigation('navigate');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works without the Navigation API', () => {
    const harness = createHarness('https://www.linkedin.com/feed/');
    const deps: UrlWatchDeps = { ...harness.deps, navigation: null };
    const onChange = vi.fn();
    const stop = watchUrlChanges(onChange, deps);

    harness.setHref('https://www.linkedin.com/in/ada/');
    harness.poll();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
