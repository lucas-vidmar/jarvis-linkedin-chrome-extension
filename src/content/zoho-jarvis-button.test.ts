// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { syncZohoJarvisLink } from '@/content/zoho-jarvis-button';

const JARVIS_URL = 'https://jarvis.agileengine.com/contacts/998335000461306666';

function mountedLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-jarvis-zoho-link]'));
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('syncZohoJarvisLink', () => {
  it('mounts one link next to the Send Email anchor on a contact page', () => {
    document.body.innerHTML =
      '<a class="em-send-email" aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);

    const links = mountedLinks();
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.getAttribute('href')).toBe(JARVIS_URL);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toBe('🚀');
    expect(link.getAttribute('aria-label')).toBe('Open in Jarvis');
    expect(link.className).toContain('em-send-email');
    expect(link.nextElementSibling?.getAttribute('aria-label')).toBe('Send Email');

    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);
  });

  it('mounts nothing for a null URL and removes an already mounted link', () => {
    syncZohoJarvisLink(null);
    expect(mountedLinks()).toHaveLength(0);

    document.body.innerHTML =
      '<a aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);

    syncZohoJarvisLink(null);
    expect(mountedLinks()).toHaveLength(0);
  });

  it('mounts nothing when no Send Email anchor exists; keeps a mounted link through transient re-renders; unmounts on navigate-away', () => {
    document.body.innerHTML = '<div class="action-bar"></div>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(0);

    document.body.innerHTML =
      '<a aria-label="Send Email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);

    document.querySelector('[aria-label="Send Email"]')?.remove();
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);

    syncZohoJarvisLink(null);
    expect(mountedLinks()).toHaveLength(0);
  });

  it('matches the Send Email label case-insensitively', () => {
    document.body.innerHTML = '<a aria-label="send email">Send Email</a>';
    syncZohoJarvisLink(JARVIS_URL);
    expect(mountedLinks()).toHaveLength(1);
  });

  it('finds the Send Email action when Zoho renders it as a <button> (real Zoho DOM)', () => {
    document.body.innerHTML =
      '<button class="lyte-button lytePrimaryBtn" aria-label="Send Email">Send Email</button>';
    syncZohoJarvisLink(JARVIS_URL);

    const links = mountedLinks();
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.getAttribute('href')).toBe(JARVIS_URL);
    expect(link.className).toContain('lyte-button');
    expect(link.nextElementSibling?.tagName).toBe('BUTTON');
    expect(link.textContent).toBe('🚀');
    expect(link.style.getPropertyValue('background-image')).toBe('none');
    expect(link.style.getPropertyValue('background-color')).toBe('#f57c00');
    expect(link.style.getPropertyValue('border-color')).toBe('#f57c00');
  });

  it('copies the reference button appearance so the link matches its look', () => {
    document.body.innerHTML =
      '<button class="lyte-button lytePrimaryBtn" aria-label="Send Email">Send Email</button>';
    syncZohoJarvisLink(JARVIS_URL);

    const link = mountedLinks()[0];
    const reference = document.querySelector('button[aria-label="Send Email"]')!;
    expect(link.style.getPropertyValue('padding')).toBe(
      getComputedStyle(reference).getPropertyValue('padding'),
    );
    expect(link.style.getPropertyValue('height')).toBe(
      getComputedStyle(reference).getPropertyValue('height'),
    );
    expect(link.style.getPropertyValue('border-radius')).toBe(
      getComputedStyle(reference).getPropertyValue('border-radius'),
    );
  });

  it('stops clicks from bubbling so Zoho does not open the email composer', () => {
    document.body.innerHTML =
      '<button class="lyte-button lytePrimaryBtn" aria-label="Send Email">Send Email</button>';
    syncZohoJarvisLink(JARVIS_URL);

    let parentClicks = 0;
    document.body.addEventListener('click', () => parentClicks++);
    let documentClicks = 0;
    document.addEventListener('click', () => documentClicks++);

    const link = mountedLinks()[0];
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(parentClicks).toBe(0);
    expect(documentClicks).toBe(0);
  });

  it('blocks capture-phase document handlers too (Zoho compose guard)', () => {
    document.body.innerHTML =
      '<button class="lyte-button lytePrimaryBtn" aria-label="Send Email">Send Email</button>';
    syncZohoJarvisLink(JARVIS_URL);

    let captureClicks = 0;
    document.addEventListener('click', () => captureClicks++, true);
    let captureMouseDowns = 0;
    document.addEventListener('mousedown', () => captureMouseDowns++, true);

    const link = mountedLinks()[0];
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    link.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(captureClicks).toBe(0);
    expect(captureMouseDowns).toBe(0);
  });
});