// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectConversation,
  findThreadRoot,
  getSelfName,
  isConversationThread,
  resetSelectorMismatchState,
  resetSelfSlugCache,
  rosterSignature,
} from '@/content/detect-conversation';
import {
  CONTACT_URL,
  SELF_URL,
  renderRoster,
  renderSelfNav,
  renderThread,
  resetDom,
} from '@/content/test-fixtures/linkedin-dom';

const THREAD_URL = 'https://www.linkedin.com/messaging/thread/2-abc123/';

function mount(html: string): void {
  document.body.innerHTML = html;
}

describe('isConversationThread', () => {
  it('accepts a concrete thread URL with an id', () => {
    expect(isConversationThread(THREAD_URL)).toBe(true);
    expect(isConversationThread('https://www.linkedin.com/messaging/thread/2-abc123')).toBe(true);
    expect(
      isConversationThread('https://www.linkedin.com/messaging/thread/2-abc123/?trk=msg'),
    ).toBe(true);
    expect(
      isConversationThread('https://www.linkedin.com/messaging/thread/2-abc123#top'),
    ).toBe(true);
  });

  it('rejects non-thread and incomplete URLs', () => {
    expect(isConversationThread('https://www.linkedin.com/messaging/')).toBe(false);
    expect(isConversationThread('https://www.linkedin.com/messaging/thread')).toBe(false);
    expect(isConversationThread('https://www.linkedin.com/messaging/thread/')).toBe(false);
    expect(isConversationThread('https://www.linkedin.com/in/ada-lovelace')).toBe(false);
    expect(isConversationThread('https://www.linkedin.com/feed/')).toBe(false);
    expect(isConversationThread('not a url')).toBe(false);
  });

  it('rejects reserved thread segments regardless of case', () => {
    for (const segment of ['new', 'list', 'archive', 'index', 'NEW', 'Archive']) {
      expect(isConversationThread(`https://www.linkedin.com/messaging/thread/${segment}`)).toBe(
        false,
      );
    }
  });
});

describe('detectConversation', () => {
  beforeEach(() => {
    resetSelfSlugCache();
    resetSelectorMismatchState();
    resetDom(THREAD_URL);
  });

  afterEach(() => {
    resetSelfSlugCache();
    resetSelectorMismatchState();
  });

  it('returns the contact name and normalized profile URL for a 1:1 thread', () => {
    mount(renderThread());

    expect(detectConversation(document)).toEqual({
      kind: 'conversation',
      contact: {
        contactName: 'Ada Lovelace',
        contactUrl: CONTACT_URL,
      },
    });
  });

  it('normalizes in.linkedin.com profile links and strips query/trailing punctuation', () => {
    mount(
      renderThread({
        rosterHtml: renderRoster(
          'Ada Lovelace',
          'https://in.linkedin.com/in/ada-lovelace?trk=msg-thread',
        ),
      }),
    );

    const result = detectConversation(document);
    expect(result.kind).toBe('conversation');
    if (result.kind !== 'conversation') return;
    expect(result.contact.contactUrl).toBe(CONTACT_URL);
  });

  it('returns none for a non-thread URL even with valid thread markup', () => {
    resetDom('https://www.linkedin.com/messaging/');
    mount(`${renderSelfNav()}${renderThread()}`);

    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('filters the signed-in participant from the roster', () => {
    mount(`${renderSelfNav()}${renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${SELF_URL}">Lin Chen</a>
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace</a>
      </div>`,
    })}`);

    const result = detectConversation(document);
    expect(result.kind).toBe('conversation');
    if (result.kind !== 'conversation') return;
    expect(result.contact).toEqual({
      contactName: 'Ada Lovelace',
      contactUrl: CONTACT_URL,
    });
  });

  it('rejects a group chat marked with a participant count', () => {
    mount(`${renderSelfNav()}${renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace</a>
        <span>+2</span>
      </div>`,
    })}`);

    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('rejects a group chat marked with comma-separated participant names', () => {
    mount(renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace, Grace Hopper</a>
      </div>`,
    }));

    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('rejects a group chat marked with several avatars', () => {
    mount(renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">
          <img alt="Ada Lovelace"><img alt="Grace Hopper">
        </a>
      </div>`,
    }));

    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('rejects a roster with more than one contact', () => {
    mount(renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace</a>
        <a href="https://www.linkedin.com/in/grace-hopper">Grace Hopper</a>
      </div>`,
    }));

    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('returns none when the thread root or roster is hidden', () => {
    mount(renderThread({ rootAttributes: 'style="display: none"' }));
    expect(findThreadRoot(document)).toBeNull();
    expect(detectConversation(document)).toEqual({ kind: 'none' });

    mount(renderThread({ rosterHtml: '<div class="msg-title-bar" style="display: none"></div>' }));
    expect(findThreadRoot(document)).toBeNull();
    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('returns none when no thread markup is present', () => {
    mount('<main><div class="msg-list">nothing here</div></main>');
    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('derives the contact name from progressively weaker signals', () => {
    const cases: Array<[string, string]> = [
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile"><h2 class="msg-entity-lockup__entity-title">  Ada
           Lovelace  </h2></a>`,
        'Ada Lovelace',
      ],
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile"><span class="msg-entity-lockup__entity-title">Ada Lovelace</span></a>`,
        'Ada Lovelace',
      ],
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile"><img alt="  Ada Lovelace  "></a>`,
        'Ada Lovelace',
      ],
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile" alt="Ada Lovelace"></a>`,
        'Ada Lovelace',
      ],
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace · Product</a>`,
        'Ada Lovelace',
      ],
      [
        `<a href="${CONTACT_URL}" class="msg-thread__link-to-profile"><h2 class="msg-entity-lockup__entity-title">✨ Ada Lovelace 🚀</h2></a>`,
        'Ada Lovelace',
      ],
    ];

    for (const [rosterHtmlPart, expected] of cases) {
      resetSelfSlugCache();
      resetSelectorMismatchState();
      mount(renderThread({ rosterHtml: `<div class="msg-title-bar">${rosterHtmlPart}</div>` }));
      const result = detectConversation(document);
      expect(result.kind, rosterHtmlPart).toBe('conversation');
      if (result.kind !== 'conversation') continue;
      expect(result.contact.contactName, rosterHtmlPart).toBe(expected);
    }
  });

  it('caps the contact name at 120 characters', () => {
    const longName = 'A'.repeat(150);
    mount(
      renderThread({
        rosterHtml: `<div class="msg-title-bar"><a href="${CONTACT_URL}"><h2 class="msg-entity-lockup__entity-title">${longName}</h2></a></div>`,
      }),
    );

    const result = detectConversation(document);
    expect(result.kind).toBe('conversation');
    if (result.kind !== 'conversation') return;
    expect(result.contact.contactName).toHaveLength(120);
  });

  it('caches the signed-in slug until the cache is reset', () => {
    mount(`${renderSelfNav()}${renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${SELF_URL}">Lin Chen</a>
        <a href="${CONTACT_URL}" class="msg-thread__link-to-profile">Ada Lovelace</a>
      </div>`,
    })}`);

    expect(detectConversation(document).kind).toBe('conversation');

    // The global nav unmounts during LinkedIn's SPA re-render: the cached self
    // slug keeps filtering the signed-in participant out.
    document.querySelector('.global-nav__me')?.remove();
    expect(detectConversation(document).kind).toBe('conversation');

    resetSelfSlugCache();
    expect(detectConversation(document)).toEqual({ kind: 'none' });
  });

  it('warns once after three consecutive selector misses for the same URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount('<main></main>');

      detectConversation(document);
      detectConversation(document);
      expect(warn).not.toHaveBeenCalled();

      detectConversation(document);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('SELECTOR_MISMATCH');
      expect(warn.mock.calls[0]?.[0]).toContain(THREAD_URL);

      detectConversation(document);
      expect(warn).toHaveBeenCalledTimes(1);

      resetSelectorMismatchState();
      detectConversation(document);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('roster helpers', () => {
  beforeEach(() => {
    resetSelfSlugCache();
    resetDom(THREAD_URL);
  });

  it('reports the roster signature for a single contact and null for a group', () => {
    mount(renderThread());
    const root = findThreadRoot(document);
    expect(root).not.toBeNull();
    expect(rosterSignature(root!, document)).toBe(CONTACT_URL);

    mount(renderThread({
      rosterHtml: `<div class="msg-title-bar">
        <a href="${CONTACT_URL}">Ada Lovelace, Grace Hopper</a>
      </div>`,
    }));
    const groupRoot = findThreadRoot(document);
    expect(rosterSignature(groupRoot!, document)).toBeNull();
  });

  it('reads and normalizes the signed-in name from the global nav', () => {
    mount(renderSelfNav(SELF_URL, '  ✨ Lin Chen '));
    expect(getSelfName(document)).toBe('Lin Chen');

    mount('<div class="global-nav__me"></div>');
    expect(getSelfName(document)).toBe('');
  });
});
