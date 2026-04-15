export interface CsrfToken {
  token: string;
  expiresAt: number;
}

const TOKEN_COOKIE_NAME = 'csrf_token';
const TOKEN_HEADER_NAME = 'X-CSRF-Token';
const TOKEN_VALIDITY_MS = 3600000; // 1 hour

function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

export function getCsrfToken(): string | null {
  return getCookie(TOKEN_COOKIE_NAME);
}

export function validateCsrfToken(token: string, cookieValue: string): boolean {
  return token === cookieValue && cookieValue.length > 0;
}

export function generateCsrfToken(): CsrfToken {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    token,
    expiresAt: Date.now() + TOKEN_VALIDITY_MS,
  };
}

export function setCsrfCookie(token: string): void {
  const expires = new Date(Date.now() + TOKEN_VALIDITY_MS).toUTCString();
  document.cookie = `${TOKEN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Expires=${expires}; SameSite=Strict; Secure`;
}

export function clearCsrfCookie(): void {
  document.cookie = `${TOKEN_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Strict; Secure`;
}

export function attachCsrfInterceptor(): () => void {
  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    const method = (init?.method ?? 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (isMutating) {
      const token = getCsrfToken();
      if (token) {
        const headers = new Headers(init?.headers);
        headers.set(TOKEN_HEADER_NAME, token);
        init = { ...init, headers };
      }
    }

    return originalFetch.call(this, input, init);
  };

  return () => {
    window.fetch = originalFetch;
  };
}

export async function validateCsrfWithServer(token: string): Promise<boolean> {
  try {
    const res = await fetch('/v1/auth/csrf/validate', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        [TOKEN_HEADER_NAME]: token,
      },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}