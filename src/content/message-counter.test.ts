// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { countVisibleMessages } from '@/content/message-counter';
import { renderThread, resetDom } from '@/content/test-fixtures/linkedin-dom';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const root = document.querySelector<HTMLElement>('.msg-thread');
  if (!root) throw new Error('fixture did not render a thread root');
  return root;
}

describe('countVisibleMessages', () => {
  beforeEach(() => {
    resetDom();
  });

  it('counts every visible message row', () => {
    const root = mount(
      renderThread({
        listHtml: `<div class="msg-s-message-list">
          <div class="msg-s-event-listitem"><p class="msg-s-event-listitem__body">one</p></div>
          <div class="msg-s-event-listitem"><p class="msg-s-event-listitem__body">two</p></div>
          <div class="msg-s-event-listitem msg-s-event-listitem--other"><p class="msg-s-event-listitem__body">three</p></div>
        </div>`,
      }),
    );

    expect(countVisibleMessages(root)).toBe(3);
  });

  it('deduplicates nested message rows by counting only the outer row', () => {
    const root = mount(
      renderThread({
        listHtml: `<div class="msg-s-message-list">
          <div class="msg-s-message-list__event">
            <div class="msg-s-event-listitem" id="outer">
              <p class="msg-s-event-listitem__body">outer</p>
              <div class="msg-s-event-listitem" id="inner">
                <p class="msg-s-event-listitem__body">inner</p>
              </div>
            </div>
          </div>
          <div class="msg-s-message-list__event">
            <div class="msg-s-event-listitem" id="sibling">
              <p class="msg-s-event-listitem__body">sibling</p>
            </div>
          </div>
        </div>`,
      }),
    );

    expect(root.querySelectorAll('.msg-s-event-listitem')).toHaveLength(3);
    expect(countVisibleMessages(root)).toBe(2);
  });

  it('ignores hidden rows, hidden ancestors and aria-hidden rows', () => {
    const root = mount(
      renderThread({
        listHtml: `<div class="msg-s-message-list">
          <div class="msg-s-event-listitem" style="display: none">hidden</div>
          <div class="msg-s-event-listitem" style="visibility: hidden">invisible</div>
          <div class="msg-s-event-listitem" aria-hidden="true">aria hidden</div>
          <div class="msg-s-message-list__event" style="display: none">
            <div class="msg-s-event-listitem">hidden by ancestor</div>
          </div>
          <div class="msg-s-event-listitem">visible</div>
        </div>`,
      }),
    );

    expect(countVisibleMessages(root)).toBe(1);
  });

  it('returns zero for a root without message rows', () => {
    const root = mount(renderThread());
    expect(countVisibleMessages(root)).toBe(0);
  });
});
