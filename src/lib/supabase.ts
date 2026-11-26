// Price Amnesia — Supabase Auth client (v1.28).
// The app is local-first and sign-in is OPTIONAL: everything works signed
// out exactly as before. Signing in only (a) identifies the account for
// Plus / support and (b) lets the AI edge functions see a user token.
//
// Project: alldcvtfohwqtaalebxr ("EricSsuppri's Project").
// The anon key below is the project's PUBLIC anon key (safe to ship in the
// app — it is not a secret; row-level security is what protects data).
// It was recovered from the project's own bundled web client on 2026-11-21
// (the setup txt holds no key). If the key is ever rotated, paste the new
// anon key here (Supabase Dashboard -> Settings -> API -> anon public).
//
// OAuth redirect: the app uses its own custom URL scheme so the system
// browser can hand control back to the app after Apple / Google sign-in.
// The scheme is registered in ios/App/App/Info.plist (CFBundleURLSchemes)
// and must ALSO be allow-listed in the Supabase Dashboard:
//   Authentication -> URL Configuration -> Redirect URLs:
//     com.priceamnesia.app://auth/callback
//   (plus the Site URL can stay the Supabase default; email confirmation
//   links use this same redirect via emailRedirectTo below.)

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const SUPABASE_URL = 'https://alldcvtfohwqtaalebxr.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsbGRjdnRmb2h3cXRhYWxlYnhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MTMwNTIsImV4cCI6MjEwNjM4OTA1Mn0.mTd03cClNNuJy---G6RSt5oGKWo7pC4V5ka92N86ED0';

/** Deep link the system browser returns to after Apple / Google sign-in. */
export const AUTH_REDIRECT_URI = 'com.priceamnesia.app://auth/callback';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Session persists across restarts in localStorage (the default).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type { User };

/** Current signed-in user, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/** Access token for the AI edge functions — null while signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Plain-English error for the sign-in form. Never leaks server detail. */
export function friendlyAuthError(e: unknown): string {
  const msg = String((e as { message?: string })?.message || e || '').toLowerCase();
  if (msg.includes('user already registered') || msg.includes('already exists') || msg.includes('already registered')) {
    return 'That email already has an account — try signing in instead.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'Wrong email or password — check both and try again.';
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'That email isn\u2019t confirmed yet — check your inbox for the confirmation link, or tap "Resend confirmation".';
  }
  if (msg.includes('password') && msg.includes('6')) {
    return 'Password needs to be at least 6 characters.';
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return 'No connection right now — check your internet and try again.';
  }
  if (msg.includes('too many') || msg.includes('rate limit')) {
    return 'Too many tries in a row — wait a minute and try again.';
  }
  if (msg.includes('email link is invalid') || msg.includes('expired')) {
    return 'That sign-in link expired — request a fresh one.';
  }
  return 'Something went wrong signing in — try again.';
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: AUTH_REDIRECT_URI },
  });
  if (error) throw error;
  return data.user;
}

export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: AUTH_REDIRECT_URI },
  });
  if (error) throw error;
}

/** Send the "set a new password" email. The link returns to the app via
 * AUTH_REDIRECT_URI; the app opens the new-password screen when the
 * recovery session lands (PASSWORD_RECOVERY event). Works even though
 * signup confirmation is OFF — reset emails are independent. */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT_URI,
  });
  if (error) throw error;
}

/** Set a new password for the current (recovery) session. */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Permanently delete the signed-in account's Supabase login.
 * The app alone cannot delete its own login — this calls the
 * "delete-account" edge function (deployed in this project, Verify JWT
 * on), which verifies the caller's JWT and deletes the auth user with
 * the service-role key. Local prices stay on the phone. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * OAuth sign-in (Apple / Google) in a native app.
 * supabase-js returns the provider URL without navigating; we open it in
 * the system browser (SFSafariViewController / Chrome Custom Tab) and the
 * provider sends the user back to AUTH_REDIRECT_URI, which iOS routes to
 * the app — App.tsx listens for that deep link and exchanges the code.
 * In a plain browser build, fall back to the normal redirect flow.
 */
export async function signInWithProvider(provider: 'apple' | 'google'): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        // v1.28.7: Google only — always show the account chooser instead of
        // silently signing in with whatever Google account is already
        // logged in inside the browser. Does not apply to Apple.
        ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
      },
    });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_REDIRECT_URI, skipBrowserRedirect: true,
      // v1.28.7: Google only — always show the account chooser.
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No sign-in page came back — try again.');
  await Browser.open({ url: data.url });
}

/**
 * Handle the deep link the browser returns with after OAuth.
 * Returns true when the URL was an auth callback we consumed.
 */
export async function handleAuthCallback(url: string): Promise<boolean> {
  if (!url.startsWith('com.priceamnesia.app://')) return false;
  try {
    const u = new URL(url);
    // PKCE flow (supabase-js default): ?code=... — exchange it.
    const code = u.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return true;
    }
    // Implicit flow fallback: #access_token=...&refresh_token=...
    const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
