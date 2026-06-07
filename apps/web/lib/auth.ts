/**
 * Minimal auth store backed by sessionStorage.
 * Credentials are validated against the API once on login,
 * then stored as a Basic Auth header for all subsequent requests.
 */

const CREDS_KEY = "signal_ai_auth";

export interface AuthUser {
  id: string;
}

function encode(username: string, password: string): string {
  return btoa(`${username}:${password}`);
}

export const auth = {
  /** Returns the pre-encoded Basic Auth header value, or null if not logged in. */
  getHeader(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(CREDS_KEY);
  },

  getUser(): AuthUser | null {
    const h = this.getHeader();
    if (!h) return null;
    try {
      const decoded = atob(h);
      const id = decoded.split(":")[0];
      return { id };
    } catch {
      return null;
    }
  },

  setSession(username: string, password: string): void {
    sessionStorage.setItem(CREDS_KEY, encode(username, password));
  },

  clearSession(): void {
    sessionStorage.removeItem(CREDS_KEY);
  },

  isLoggedIn(): boolean {
    return !!this.getHeader();
  },
};

