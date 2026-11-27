/**
 * Synthetic LinkedIn messaging DOM fixtures.
 *
 * These helpers build markup from the selectors the extension relies on
 * (`SELECTORS` in `src/content/detect-conversation.ts`). Everything here is
 * invented: the names, URLs and message bodies are not taken from a real
 * LinkedIn page.
 */

export const SELF_NAME = 'Lin Chen';
export const SELF_URL = 'https://www.linkedin.com/in/lin-chen';
export const CONTACT_NAME = 'Ada Lovelace';
export const CONTACT_URL = 'https://www.linkedin.com/in/ada-lovelace';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SentMessageFixture {
  text: string;
  sender?: 'self' | 'contact';
  /** Visible timestamp text, e.g. `9:30 AM`. Omit for a carry-forward row. */
  time?: string;
  /** ISO value rendered on the timestamp's `datetime` attribute. */
  datetime?: string;
  hidden?: boolean;
  /** Omit the canonical body paragraph to exercise the text fallback. */
  omitBody?: boolean;
}

export interface DayGroupFixture {
  header?: string;
  rows?: SentMessageFixture[];
  /** Extra markup placed before the group inside the message list (sentinel). */
  sentinelBefore?: string;
}

export function renderTimestamp(row: SentMessageFixture): string {
  if (!row.time && !row.datetime) return '';
  const datetime = row.datetime ? ` datetime="${escapeHtml(row.datetime)}"` : '';
  return `<time class="msg-s-message-group__timestamp"${datetime}>${escapeHtml(row.time ?? '')}</time>`;
}

export function renderRow(row: SentMessageFixture): string {
  const classes = ['msg-s-event-listitem'];
  if (row.sender === 'contact') classes.push('msg-s-event-listitem--other');
  const style = row.hidden ? ' style="display: none"' : '';
  const body = row.omitBody
    ? '<button type="button" aria-label="More actions">•••</button>'
    : `<p class="msg-s-event-listitem__body">${escapeHtml(row.text)}</p>`;
  return `<div class="${classes.join(' ')}"${style}>${body}${renderTimestamp(row)}</div>`;
}

export function renderMessageList(groups: DayGroupFixture[]): string {
  const body = groups
    .map((group) => {
      const header = group.header
        ? `<time class="msg-s-message-list__time-heading">${escapeHtml(group.header)}</time>`
        : '';
      const rows = (group.rows ?? []).map(renderRow).join('');
      return `${group.sentinelBefore ?? ''}<div class="msg-s-message-list__event">${header}${rows}</div>`;
    })
    .join('');
  return `<div class="msg-s-message-list">${body}</div>`;
}

export function renderSelfNav(href = SELF_URL, name = SELF_NAME): string {
  return `<div class="global-nav__me"><a href="${escapeHtml(href)}"><img alt="${escapeHtml(
    name,
  )}" src="self-avatar.png"></a></div>`;
}

export interface ThreadFixture {
  contactName?: string;
  contactHref?: string;
  /** Overrides the whole roster cluster (for group-chat and fallback tests). */
  rosterHtml?: string;
  listHtml?: string;
  /** Extra attributes on the thread root, e.g. `style="display: none"`. */
  rootAttributes?: string;
}

export function renderRoster(
  contactName = CONTACT_NAME,
  contactHref = CONTACT_URL,
): string {
  return `<div class="msg-title-bar">
    <a class="msg-thread__link-to-profile" href="${escapeHtml(contactHref)}">
      <img alt="${escapeHtml(contactName)}" src="contact-avatar.png">
      <h2 class="msg-entity-lockup__entity-title">${escapeHtml(contactName)}</h2>
    </a>
  </div>`;
}

export function renderThread(fixture: ThreadFixture = {}): string {
  const roster =
    fixture.rosterHtml ??
    renderRoster(fixture.contactName ?? CONTACT_NAME, fixture.contactHref ?? CONTACT_URL);
  const attributes = fixture.rootAttributes ? ` ${fixture.rootAttributes}` : '';
  return `<main><section class="msg-thread"${attributes}>${roster}${
    fixture.listHtml ?? ''
  }</section></main>`;
}

export function renderThreadWithGroups(
  groups: DayGroupFixture[],
  fixture: ThreadFixture = {},
): string {
  return renderThread({ ...fixture, listHtml: renderMessageList(groups) });
}

/** Sets the happy-dom document URL without navigating. */
export function setDocumentUrl(url: string): void {
  const happyDOM = (window as unknown as {
    happyDOM?: { setURL?: (next: string) => void };
  }).happyDOM;
  happyDOM?.setURL?.(url);
}

export function resetDom(url = 'https://www.linkedin.com/messaging/thread/2-abc/'): void {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  setDocumentUrl(url);
}

/** Lets pending promise chains (microtasks) settle. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
