'use client';

/**
 * Shared fetch wrapper for frontend API calls.
 *
 * Features:
 *  - Automatically includes CSRF token on state-changing requests (POST/PUT/DELETE)
 *  - Sets `credentials: 'include'` so cookies are always sent
 *  - Defaults Content-Type to application/json when a body is present
 *  - Auto-retries once on 401 by calling /api/auth/refresh (token rotation)
 */

/** Read CSRF token from the csrf_token cookie (httpOnly: false). */
export function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='))
      ?.split('=')[1] || ''
  );
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();

  const headers = new Headers(options.headers);

  // Auto-include CSRF token for state-changing requests
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', getCsrfToken());
  }

  // Default Content-Type for JSON bodies
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchOptions: RequestInit = {
    ...options,
    method,
    headers,
    credentials: 'include',
  };

  let res = await fetch(url, fetchOptions);

  // Auto-refresh on 401 — skip for auth routes to avoid infinite loops
  if (res.status === 401 && !url.includes('/api/auth/')) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshRes.ok) {
      // Retry the original request with the fresh cookie
      res = await fetch(url, fetchOptions);
    }
  }

  return res;
}

/**
 * Read a streaming text response, calling `onChunk` with the accumulated
 * text after every chunk. Returns the complete text when the stream ends.
 */
export async function readStream(
  response: Response,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(text);
  }

  return text;
}
