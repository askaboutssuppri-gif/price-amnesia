// Price Amnesia — sign-in screen (v1.28).
// Email + password (sign in / create account) and Sign in with Apple /
// Google through Supabase Auth. Signing in is OPTIONAL — the whole app
// works signed out, and all prices stay on this phone either way.
// Shown as an overlay from Settings → Account and from the Home top bar.

import React, { useState, useEffect } from 'react';
import {
  signInWithEmail, signUpWithEmail, resendConfirmation,
  signInWithProvider, requestPasswordReset, updatePassword, friendlyAuthError,
} from '../lib/supabase';

export type AuthStartMode = 'signin' | 'signup' | 'newpassword';

export default function AuthModal({ onClose, startMode = 'signin', oauthError = '' }: { onClose: () => void; startMode?: AuthStartMode; oauthError?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'newpassword'>(startMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [waitingProvider, setWaitingProvider] = useState<'' | 'apple' | 'google'>('');
  const [confirmPending, setConfirmPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  // v1.28.6: an OAuth attempt that came back with an error (e.g. Google)
  // reports here once the browser closes — never a silent blank page.
  useEffect(() => {
    if (oauthError) { setError(oauthError); setWaitingProvider(''); }
  }, [oauthError]);

  const submit = async () => {
    const em = email.trim().toLowerCase();
    if (mode === 'forgot') {
      if (!em || !em.includes('@')) { setError('Enter your email above first.'); return; }
      setBusy(true); setError(''); setNotice('');
      try {
        await requestPasswordReset(em);
        setResetSent(true);
        setNotice('Reset link sent — check your inbox (and spam). The link expires in an hour; tap it and you\u2019ll come straight back here to set a new password.');
      } catch (e) {
        setError(friendlyAuthError(e));
      }
      setBusy(false);
      return;
    }
    if (mode === 'newpassword') {
      if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
      if (password !== password2) { setError('The two passwords don\u2019t match — try again.'); return; }
      setBusy(true); setError(''); setNotice('');
      try {
        await updatePassword(password);
        setPwDone(true);
        setNotice('Password updated — you\u2019re signed in with your new password.');
      } catch (e) {
        setError(friendlyAuthError(e));
      }
      setBusy(false);
      return;
    }
    if (!em || !em.includes('@')) { setError('Enter a valid email address.'); return; }
    if (password.length < 6) { setError('Password needs to be at least 6 characters.'); return; }
    setBusy(true); setError(''); setNotice(''); setConfirmPending(false);
    try {
      if (mode === 'signin') {
        await signInWithEmail(em, password);
        onClose(); // session arrives via onAuthStateChange
      } else {
        const user = await signUpWithEmail(em, password);
        if (user) {
          // No session yet = email confirmation is on: check the inbox.
          setConfirmPending(true);
          setNotice('Account created — check your inbox for the confirmation link, then come back and sign in.');
        } else {
          setNotice('Check your inbox for the confirmation link, then come back and sign in.');
          setConfirmPending(true);
        }
      }
    } catch (e) {
      setError(friendlyAuthError(e));
      if (String((e as { message?: string })?.message || '').toLowerCase().includes('not confirmed')) setConfirmPending(true);
    }
    setBusy(false);
  };

  const oauth = async (provider: 'apple' | 'google') => {
    setBusy(true); setError(''); setWaitingProvider(provider);
    try {
      await signInWithProvider(provider);
      // The system browser opens; when Apple/Google sends the user back,
      // the app exchanges the code and the session arrives — the modal
      // closes from the parent when the user appears.
      setNotice(provider === 'apple'
        ? 'Finish signing in with Apple in the browser — you\u2019ll come straight back here.'
        : 'Finish signing in with Google in the browser — you\u2019ll come straight back here.');
    } catch (e) {
      setError(friendlyAuthError(e));
      setWaitingProvider('');
    }
    setBusy(false);
  };

  const resend = async () => {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) { setError('Enter your email above first.'); return; }
    setBusy(true); setError('');
    try {
      await resendConfirmation(em);
      setNotice('Confirmation email sent — check your inbox (and spam).');
    } catch (e) {
      setError(friendlyAuthError(e));
    }
    setBusy(false);
  };

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Set a new password';
  const submitLabel = busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? (resetSent ? 'Send it again' : 'Send reset link') : 'Set new password';

  return (
    <div className="overlay">
      <div className="overlay-inner">
        <div className="overlay-head">
          <div className="overlay-title">{title}</div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card">
          {mode === 'forgot' ? (
            <p className="small-note" style={{ lineHeight: 1.6 }}>
              Enter the email you signed up with and we&rsquo;ll send a reset link.
              Tap it and you&rsquo;ll come straight back here to set a new password.
            </p>
          ) : mode === 'newpassword' ? (
            <p className="small-note" style={{ lineHeight: 1.6 }}>
              You came from your reset link — pick a new password and you&rsquo;re back in.
            </p>
          ) : (
            <p className="small-note" style={{ lineHeight: 1.6 }}>
              Signing in is optional — your prices stay on this phone either way. An account
              ties Plus to you (so it follows you to a new phone) and lets Echo know it&rsquo;s you.
            </p>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className={`chip-btn ${mode === 'signin' ? 'chip-on' : ''}`} onClick={() => { setMode('signin'); setError(''); setNotice(''); }} style={{ flex: 1 }}>Sign in</button>
              <button className={`chip-btn ${mode === 'signup' ? 'chip-on' : ''}`} onClick={() => { setMode('signup'); setError(''); setNotice(''); }} style={{ flex: 1 }}>Create account</button>
            </div>
          )}

          {mode !== 'newpassword' && (
            <input
              type="email" value={email} placeholder="Email address" autoCapitalize="off" autoCorrect="off"
              onChange={e => setEmail(e.target.value)} style={{ marginTop: 12 }}
            />
          )}
          {(mode === 'signin' || mode === 'signup') && (
            <input
              type="password" value={password} placeholder="Password (6+ characters)"
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
              style={{ marginTop: 8 }}
            />
          )}
          {mode === 'newpassword' && (
            <>
              <input
                type="password" value={password} placeholder="New password (6+ characters)"
                onChange={e => setPassword(e.target.value)}
                style={{ marginTop: 12 }}
              />
              <input
                type="password" value={password2} placeholder="Repeat the new password"
                onChange={e => setPassword2(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
                style={{ marginTop: 8 }}
              />
            </>
          )}
          {error && <p className="small-note" style={{ color: 'var(--rise)', marginTop: 10 }}>⚠️ {error}</p>}
          {notice && <p className="small-note" style={{ marginTop: 10 }}>✅ {notice}</p>}
          {confirmPending && (
            <button className="ghost-btn" style={{ marginTop: 8 }} onClick={resend} disabled={busy}>
              Resend confirmation email
            </button>
          )}
          {pwDone ? (
            <button className="big-btn" style={{ marginTop: 12 }} onClick={onClose}>Done</button>
          ) : (
            <button className="big-btn" style={{ marginTop: 12 }} onClick={submit} disabled={busy}>
              {submitLabel}
            </button>
          )}
          {mode === 'signin' && (
            <button className="ghost-btn" style={{ marginTop: 8 }} onClick={() => { setMode('forgot'); setError(''); setNotice(''); setResetSent(false); }}>
              Forgot password?
            </button>
          )}
          {mode === 'forgot' && (
            <button className="ghost-btn" style={{ marginTop: 8 }} onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>
              Back to sign in
            </button>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 10px' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
                <span className="small-note">or</span>
                <span style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
              </div>

              <button className="big-btn" style={{ marginTop: 0 }} onClick={() => void oauth('apple')} disabled={busy}>
                {waitingProvider === 'apple' ? 'Waiting for Apple…' : '🍎 Continue with Apple'}
              </button>
              <button className="big-btn" style={{ marginTop: 8 }} onClick={() => void oauth('google')} disabled={busy}>
                {waitingProvider === 'google' ? 'Waiting for Google…' : 'G Continue with Google'}
              </button>

              <button className="ghost-btn" style={{ marginTop: 14 }} onClick={onClose}>
                Continue without signing in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
