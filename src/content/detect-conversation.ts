const LINKEDIN_ORIGIN = 'https://www.linkedin.com';

export const SELECTORS = {
  threadRoots: [
    'main .msg-thread',
    '.msg-thread',
  ],
  rosterClusters: [
    '.msg-title-bar',
  ],
  selfSource: '.global-nav__me a[href*="/in/"]',
  participantLinks: 'a.msg-thread__link-to-profile, a[href*="/in/"]',
  participantAvatars: 'img[alt]',
  actionRowTargets: [
    '.msg-title-bar__title-bar-title',
  ],
  messageRows: [
    '.msg-s-message-list__event',
    '[data-msg-id]',
  ],
  messageText: [
    '[data-test-id="msg-message-content"]',
    '.msg-s-message-list__event__content',
  ],
  messageTimestamp: ['time[datetime]'],
  selfMessageMarkers: [
    '.msg-s-message-list__event--out',
    '[class*="--out"]',
    '[class*="--self"]',
  ],
} as const;

const RESERVED_THREAD_SEGMENTS = new Set(['new', 'list', 'archive', 'index']);

export interface ContactRef {
  contactName: string;
  contactUrl: string;
}

export type ConversationDetection =
  | { kind: 'none' }
  | { kind: 'conversation'; contact: ContactRef };

interface ProfileReference {
  slug: string;
  url: string;
  element: Element;
}

interface RosterResult {
  refs: ProfileReference[];
  signature: string;
}

let selfSlug: string | null = null;
let mismatchState: { url: string; misses: number } | null = null;

export function isConversationThread(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 3) return false;
  if (segments[0] !== 'messaging' || segments[1] !== 'thread') return false;
  const threadId = segments[2];
  if (!threadId) return false;
  if (RESERVED_THREAD_SEGMENTS.has(threadId.toLowerCase())) return false;
  return true;
}

export function isVisible(element: Element): boolean {
  if (element.getAttribute('aria-hidden') === 'true') return false;
  let node: Element | null = element;
  while (node) {
    const style = node instanceof HTMLElement ? getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }
    node = node.parentElement;
  }
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ checkOpacity: false });
  }
  return element.getClientRects().length > 0;
}

function findRosterCluster(root: HTMLElement): HTMLElement | null {
  for (const selector of SELECTORS.rosterClusters) {
    const cluster = root.querySelector<HTMLElement>(selector);
    if (cluster && isVisible(cluster)) return cluster;
  }
  return null;
}

export function findThreadRoot(doc: Document): HTMLElement | null {
  for (const selector of SELECTORS.threadRoots) {
    const root = doc.querySelector<HTMLElement>(selector);
    if (root && isVisible(root) && findRosterCluster(root)) return root;
  }
  return null;
}

function extractSlug(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value, LINKEDIN_ORIGIN);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^in\.linkedin\.com$/, 'www.linkedin.com');
  if (host !== 'www.linkedin.com' && host !== 'linkedin.com') {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const inIndex = parts.lastIndexOf('in');
  if (inIndex < 0 || inIndex >= parts.length - 1) return null;
  const slug = parts[inIndex + 1]?.replace(/[.\-]+$/g, '').toLowerCase();
  return slug && slug.length > 0 ? slug : null;
}

function normalizeProfileUrl(slug: string): string {
  return `${LINKEDIN_ORIGIN}/in/${slug}`;
}

function collapseWhitespace(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function getSelfSlug(doc: Document): string | null {
  if (selfSlug !== null) return selfSlug;
  const link = doc.querySelector<HTMLAnchorElement>(SELECTORS.selfSource);
  const href = link?.getAttribute('href');
  if (!href) {
    return null;
  }
  const slug = extractSlug(href);
  if (!slug) {
    return null;
  }
  selfSlug = slug;
  return selfSlug;
}

export function resetSelfSlugCache(): void {
  selfSlug = null;
}

function pushProfileReference(
  refs: ProfileReference[],
  seen: Set<string>,
  value: string | null | undefined,
  element: Element,
  selfSlugValue: string | null,
): void {
  if (!value) return;
  const slug = extractSlug(value);
  if (!slug) return;
  if (selfSlugValue && slug === selfSlugValue) return;
  const url = normalizeProfileUrl(slug);
  if (seen.has(url)) return;
  seen.add(url);
  refs.push({ slug, url, element });
}

function hasGroupIndicator(cluster: HTMLElement): boolean {
  const clusterText = collapseWhitespace(cluster.textContent);
  if (/\+[ ]?\d|\b\d+[ ]+(more|others?)\b/i.test(clusterText)) {
    return true;
  }

  const nameNodes = cluster.querySelectorAll<HTMLElement>(SELECTORS.participantLinks);
  const nameText = Array.from(nameNodes)
    .map((node) => collapseWhitespace(node.textContent))
    .filter(Boolean)
    .join(' ');
  if (/,\s*|^You[\s,]/.test(nameText)) {
    return true;
  }

  const avatars = cluster.querySelectorAll(SELECTORS.participantAvatars);
  return avatars.length > 1;
}

function collectRosterRefs(root: HTMLElement, doc: Document): RosterResult | null {
  const cluster = findRosterCluster(root);
  if (!cluster) return null;
  if (hasGroupIndicator(cluster)) return null;

  const selfSlugValue = getSelfSlug(doc);
  const refs: ProfileReference[] = [];
  const seen = new Set<string>();

  for (const anchor of cluster.querySelectorAll<HTMLAnchorElement>(SELECTORS.participantLinks)) {
    pushProfileReference(refs, seen, anchor.getAttribute('href'), anchor, selfSlugValue);
  }

  if (refs.length !== 1) return null;

  const signature = refs.map((ref) => ref.url).sort().join('|');
  return { refs, signature };
}

function findContactName(element: Element): string {
  const alt = element.querySelector('img[alt]')?.getAttribute('alt');
  if (alt) {
    return collapseWhitespace(alt).slice(0, 120);
  }
  const ownAlt = element.getAttribute('alt');
  if (ownAlt) {
    return collapseWhitespace(ownAlt).slice(0, 120);
  }
  const text = collapseWhitespace(element.textContent);
  if (text && !text.includes('/in/')) {
    return text.split(/[·|]/)[0]?.trim().slice(0, 120) ?? '';
  }
  return '';
}

export function rosterSignature(root: HTMLElement, doc: Document): string | null {
  return collectRosterRefs(root, doc)?.signature ?? null;
}

export function detectConversation(doc: Document): ConversationDetection {
  const url = doc.location.href;
  if (!isConversationThread(url)) {
    return { kind: 'none' };
  }
  const root = findThreadRoot(doc);
  if (!root) {
    noteSelectorMismatch(url);
    return { kind: 'none' };
  }
  const roster = collectRosterRefs(root, doc);
  if (!roster || roster.refs.length !== 1) {
    return { kind: 'none' };
  }
  const ref = roster.refs[0];
  if (!ref) {
    return { kind: 'none' };
  }
  return {
    kind: 'conversation',
    contact: { contactName: findContactName(ref.element), contactUrl: ref.url },
  };
}

function noteSelectorMismatch(url: string): void {
  if (mismatchState?.url === url) {
    mismatchState.misses += 1;
  } else {
    mismatchState = { url, misses: 1 };
  }
  if (mismatchState.misses === 3) {
    console.warn(`[jarvis-sync] SELECTOR_MISMATCH: no visible thread root matched for ${url}`);
  }
}

export function resetSelectorMismatchState(): void {
  mismatchState = null;
}
