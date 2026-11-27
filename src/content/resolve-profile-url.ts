const MAX_STREAM_BYTES = 512 * 1024;
export const RESOLVE_PROFILE_URL_TIMEOUT_MS = 5_000;

const SLUG_RE = /\/in\/([a-zA-Z0-9_-]+)\/?/g;

/** Successfully resolved clean profile URLs, keyed by the original URL. */
const resolvedUrlCache = new Map<string, string>();

function isEncryptedSlug(slug: string): boolean {
  return /^ACo/.test(slug);
}

export async function resolveCleanProfileUrl(input: string): Promise<string | null> {
  const cached = resolvedUrlCache.get(input);
  if (cached !== undefined) {
    return cached;
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const isMessagingProfileUrl =
    parsed.hostname === 'www.linkedin.com' && parsed.pathname.startsWith('/in/');

  const slugMatch = /^\/in\/([a-zA-Z0-9_-]+)/.exec(parsed.pathname);
  const slug = slugMatch?.[1];
  if (!slug || !isMessagingProfileUrl) {
    return null;
  }
  if (!isEncryptedSlug(slug)) {
    return parsed.origin + `/in/${slug}/`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_PROFILE_URL_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(input, { redirect: 'follow', signal: controller.signal });
    } catch {
      // Timed out, aborted, or offline: callers fall back to the original URL.
      return null;
    }
    if (!response.ok || !response.body) {
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let received = 0;

    try {
      while (received < MAX_STREAM_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        received += value.length;

        const found = extractCleanSlug(buffer);
        if (found) {
          const resolved = `https://www.linkedin.com/in/${found}/`;
          resolvedUrlCache.set(input, resolved);
          await reader.cancel().catch(() => undefined);
          return resolved;
        }
      }
    } catch {
      // The timeout aborted the stream mid-read.
      return null;
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only: clear the per-contact resolution cache. */
export function resetResolvedProfileUrlCache(): void {
  resolvedUrlCache.clear();
}

function extractCleanSlug(html: string): string | null {
  SLUG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLUG_RE.exec(html)) !== null) {
    const candidate = match[1];
    if (!isEncryptedSlug(candidate)) {
      return candidate;
    }
  }
  return null;
}
