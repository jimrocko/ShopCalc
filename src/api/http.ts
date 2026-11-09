export type FetchLike = typeof fetch;

export type FetchJsonResult =
  | { ok: true; status: number; json: unknown }
  | { ok: false; reason: 'offline' | 'timeout' | 'network' | 'http'; status?: number };

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** GET mit Zeitlimit; folgt Weiterleitungen (z. B. Open Food Facts → Open Beauty Facts). */
export async function fetchJson(
  url: string,
  { timeoutMs = 8000, fetchImpl = fetch, okStatuses = [] as number[] }: { timeoutMs?: number; fetchImpl?: FetchLike; okStatuses?: number[] } = {},
): Promise<FetchJsonResult> {
  if (isOffline()) return { ok: false, reason: 'offline' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' }, redirect: 'follow' });
    if (!res.ok && !okStatuses.includes(res.status)) return { ok: false, reason: 'http', status: res.status };
    return { ok: true, status: res.status, json: await res.json() };
  } catch (e) {
    if (isOffline()) return { ok: false, reason: 'offline' };
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
