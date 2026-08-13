// Client-side session, matching the sibling projects-pwa: localStorage (survives the PWA
// being closed or evicted by iOS) with an explicit expiry, rather than sessionStorage,
// which dropped the login every time the app was backgrounded out of memory.
//
// This is a convenience gate, not a security boundary — the PIN is verified server-side
// on every login, but nothing here stops a determined user editing localStorage. That is
// acceptable for an internal tool on personal devices.

import { SESSION_KEY, SESSION_TTL_DAYS } from '@/lib/constants';

const TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function saveUser(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      name:      user.name,
      role:      user.role,
      expiresAt: Date.now() + TTL_MS,
    }));
  } catch {
    // private mode / quota — the user simply gets logged out on reload
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.name || !session?.expiresAt) return null;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { name: session.name, role: session.role };
  } catch {
    return null;
  }
}

export function clearUser() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
