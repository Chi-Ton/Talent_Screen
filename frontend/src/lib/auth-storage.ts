import type { LoginResponse } from "@/features/auth/auth-api";

const AUTH_KEY = "talentscreen.auth";

export function saveAuthSession(session: LoginResponse, remember: boolean) {
  const storage = remember ? window.localStorage : window.sessionStorage;
  const otherStorage = remember ? window.sessionStorage : window.localStorage;
  otherStorage.removeItem(AUTH_KEY);
  storage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function getAuthSession(): LoginResponse | null {
  const raw = window.localStorage.getItem(AUTH_KEY) ?? window.sessionStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LoginResponse;
  } catch {
    window.localStorage.removeItem(AUTH_KEY);
    window.sessionStorage.removeItem(AUTH_KEY);
    return null;
  }
}

