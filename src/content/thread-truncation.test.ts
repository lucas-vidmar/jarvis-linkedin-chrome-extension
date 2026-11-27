// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { detectThreadTruncation } from '@/content/thread-truncation';
import { renderThread, resetDom } from '@/content/test-fixtures/linkedin-dom';

interface Metrics {
  scrollHeight?: number;
  clientHeight?: number;
  scrollTop?: number;
  top?: number;
}

function setMetrics(element: HTMLElement, metrics: Metrics): void {
  const values: Array<[keyof Metrics, string]> = [
    ['scrollHeight', 'scrollHeight'],
    ['clientHeight', 'clientHeight'],
    ['scrollTop', 'scrollTop'],
  ];
  for (const [key, property] of values) {
    const value = metrics[key];
    if (value === undefined) continue;
    Object.defineProperty(element, property, { value, configurable: true });
  }
  if (metrics.top !== undefined) {
    const top = metrics.top;
    element.getBoundingClientRect = () =>
      ({
        x: 0,
        y: top,
        top,
        left: 0,
        right: 0,
        bottom: top,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
}

function mount(listHtml: string): {
  root: HTMLElement;
  list: HTMLElement;
  firstGroup: HTMLElement;
} {
  document.body.innerHTML = renderThread({ listHtml });
  const root = document.querySelector<HTMLElement>('.msg-thread')!;
  const list = document.querySelector<HTMLElement>('.msg-s-message-list')!;
  const firstGroup = document.querySelector<HTMLElement>('.msg-s-message-list__event')!;
  return { root, list, firstGroup };
}

const GROUP = '<div class="msg-s-message-list__event"><div class="msg-s-event-listitem">hi</div></div>';

describe('detectThreadTruncation', () => {
  beforeEach(() => {
    resetDom();
  });

  it('detects a scrollable list whose first group starts above the viewport', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">${GROUP}</div>`,
    );
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 120 });

    expect(detectThreadTruncation(root)).toBe(true);
  });

  it('accounts for scrollTop when the first group is partially scrolled out', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">${GROUP}</div>`,
    );
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 200, top: 0 });
    setMetrics(firstGroup, { top: -100 });

    expect(detectThreadTruncation(root)).toBe(true);

    setMetrics(list, { scrollTop: 50 });
    expect(detectThreadTruncation(root)).toBe(false);
  });

  it('does not report truncation when the list content fits', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">${GROUP}</div>`,
    );
    setMetrics(list, { scrollHeight: 400, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 120 });

    expect(detectThreadTruncation(root)).toBe(false);
  });

  it('does not report truncation when the first group starts at the top', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">${GROUP}</div>`,
    );
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 0 });

    expect(detectThreadTruncation(root)).toBe(false);
  });

  it('subtracts list padding, border and first-group margin from the content offset', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto; padding-top: 200px; border-top: 4px solid black">${GROUP}</div>`,
    );
    firstGroup.style.marginTop = '6px';
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 180 });

    // 180 - 200 - 4 - 6 = -30
    expect(detectThreadTruncation(root)).toBe(false);

    setMetrics(firstGroup, { top: 400 });
    // 400 - 200 - 4 - 6 = 190
    expect(detectThreadTruncation(root)).toBe(true);
  });

  it('detects a loading sentinel above the first group even when it is flush with the top', () => {
    const sentinels = [
      '<div aria-busy="true"></div>',
      '<div><span role="progressbar"></span></div>',
      '<div><span class="artdeco-spinner"></span></div>',
      '<div>Loading older messages…</div>',
      '<div>Loading earlier messages</div>',
    ];

    for (const sentinel of sentinels) {
      resetDom();
      const { root, list, firstGroup } = mount(
        `<div class="msg-s-message-list" style="overflow-y: auto">${sentinel}${GROUP}</div>`,
      );
      setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
      setMetrics(firstGroup, { top: 0 });

      expect(detectThreadTruncation(root), sentinel).toBe(true);
    }
  });

  it('does not treat an unrelated sibling above the first group as a loading sentinel', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">
        <div aria-busy="false">Older messages</div>${GROUP}
      </div>`,
    );
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 0 });

    expect(detectThreadTruncation(root)).toBe(false);
  });

  it('falls back to a scrollable ancestor when the message list itself is not scrollable', () => {
    document.body.innerHTML = renderThread({
      listHtml: `<div class="msg-scroll" style="overflow-y: auto">
        <div class="msg-s-message-list">
          <div class="msg-s-message-list__event">hi</div>
        </div>
      </div>`,
    });
    const root = document.querySelector<HTMLElement>('.msg-thread')!;
    const list = document.querySelector<HTMLElement>('.msg-scroll')!;
    const firstGroup = document.querySelector<HTMLElement>('.msg-s-message-list__event')!;
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 50 });

    expect(detectThreadTruncation(root)).toBe(true);
  });

  it('finds the group without a .msg-s-message-list wrapper', () => {
    document.body.innerHTML = renderThread({
      listHtml: `<div class="scroller" style="overflow-y: scroll">
        <div class="msg-s-message-list__event">hi</div>
      </div>`,
    });
    const root = document.querySelector<HTMLElement>('.msg-thread')!;
    const scroller = document.querySelector<HTMLElement>('.scroller')!;
    const firstGroup = document.querySelector<HTMLElement>('.msg-s-message-list__event')!;
    setMetrics(scroller, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    setMetrics(firstGroup, { top: 80 });

    expect(detectThreadTruncation(root)).toBe(true);
  });

  it('returns false without a scroll container, groups or a thread root', () => {
    const noScroll = mount(`<div class="msg-s-message-list">${GROUP}</div>`);
    setMetrics(noScroll.list, { scrollHeight: 2000, clientHeight: 600, top: 0 });
    setMetrics(noScroll.firstGroup, { top: 50 });
    expect(detectThreadTruncation(noScroll.root)).toBe(false);

    resetDom();
    document.body.innerHTML = renderThread({
      listHtml: '<div class="msg-s-message-list" style="overflow-y: auto"></div>',
    });
    const emptyRoot = document.querySelector<HTMLElement>('.msg-thread')!;
    const emptyList = document.querySelector<HTMLElement>('.msg-s-message-list')!;
    setMetrics(emptyList, { scrollHeight: 2000, clientHeight: 600 });
    expect(detectThreadTruncation(emptyRoot)).toBe(false);

    expect(detectThreadTruncation(document.createElement('div'))).toBe(false);
  });

  it('returns false instead of throwing when layout reads fail', () => {
    const { root, list, firstGroup } = mount(
      `<div class="msg-s-message-list" style="overflow-y: auto">${GROUP}</div>`,
    );
    setMetrics(list, { scrollHeight: 2000, clientHeight: 600, scrollTop: 0, top: 0 });
    firstGroup.getBoundingClientRect = () => {
      throw new Error('layout exploded');
    };

    expect(detectThreadTruncation(root)).toBe(false);
  });
});
