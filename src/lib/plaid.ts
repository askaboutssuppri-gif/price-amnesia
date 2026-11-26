// Price Amnesia — real bank linking client (Plaid via Supabase edge functions).
// Backend went LIVE 2026-10-22 (verified end-to-end from the build machine):
//   plaid-link-token · plaid-exchange · plaid-accounts in EricSsuppri's Project.
// The bank logs the user in itself inside the Link sheet; the app never sees
// a bank password, and Plaid access tokens live only in the pa_plaid_items
// vault (service-role functions only). This phone identifies itself with a
// private device id. Link runs inside the app WebView — the pattern proven
// on-device by BeastBank v3.10.
import { Account, AccountKind } from './bank';
import { Receipt, detectCategory } from './store';

const BASE = 'https://alldcvtfohwqtaalebxr.supabase.co/functions/v1';
const DEVICE_KEY = 'priceamnesia:device';
const LINKED_KEY = 'priceamnesia:plaid-linked';
const HIDDEN_KEY = 'priceamnesia:plaid-hidden';

export function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      d = (crypto as any).randomUUID ? crypto.randomUUID() : 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch { return 'dev-shared'; }
}

export function plaidWasLinked(): boolean {
  try { return localStorage.getItem(LINKED_KEY) === '1'; } catch { return false; }
}

const SYNC_KEY = 'priceamnesia:plaid-synced-at';
export function lastSyncedAt(): number {
  try { return Number(localStorage.getItem(SYNC_KEY) || 0); } catch { return 0; }
}
export function freshLabel(now = Date.now()): string {
  const t = lastSyncedAt();
  if (!t) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 2) return 'fresh just now';
  if (mins < 60) return `fresh ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `fresh ${hrs}h ago`;
  return `fresh ${Math.round(hrs / 24)}d ago`;
}

/** Fetch + merge + stamp the sync time. Throws on network failure so
 *  callers can stay silent or report, as fits their surface. */
export async function syncPlaidAccounts(local: Account[]): Promise<Account[]> {
  const remote = await fetchPlaidAccounts();
  const merged = mergePlaidAccounts(local, remote);
  try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* ignore */ }
  return merged;
}

const fmt$ = (n: number) => '$' + n.toFixed(2);
/** One context block describing linked accounts for Echo's AI surfaces.
 *  Empty string when nothing is linked (contexts stay unchanged).
 *  v1.28.14: when the phone has bank purchases saved, a short spending
 *  summary rides along so Echo can answer "what did I spend?" from real
 *  numbers. Transactions default to what's saved on-device, so every
 *  existing call site gets the summary with no changes. */
export function bankContextLine(accounts: Account[], transactions: BankTransaction[] = loadTransactions()): string {
  const linked = accounts.filter(a => a.plaidId);
  if (!linked.length) return '';
  const list = linked.map(a => `${a.institution || 'Bank'} ${a.name}${a.last4 ? ` ••${a.last4}` : ''} (${a.kind}): ${fmt$(a.balance)}`).join('; ');
  let out = `Linked bank accounts (real balances, auto-updated): ${list}.`;
  const buys = transactions.filter(t => t.amount > 0);
  if (buys.length) {
    const now = new Date();
    const thisMonth = buys.filter(t => { const d = new Date(t.date + 'T12:00:00'); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); });
    const total30 = buys.reduce((s, t) => s + t.amount, 0);
    const totalMonth = thisMonth.reduce((s, t) => s + t.amount, 0);
    const byMerchant = new Map<string, number>();
    for (const t of buys) byMerchant.set(t.merchant, (byMerchant.get(t.merchant) || 0) + t.amount);
    const top = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, a]) => `${m} ${fmt$(a)}`).join(', ');
    const pending = buys.filter(t => t.pending);
    const pendingAmt = pending.reduce((s, t) => s + t.amount, 0);
    out += ` Bank card purchases (auto-synced, last 30 days): ${fmt$(total30)} across ${buys.length} buys; this month ${fmt$(totalMonth)}.${top ? ` Most: ${top}.` : ''}${pending.length ? ` Pending (not final yet): ${fmt$(pendingAmt)} across ${pending.length} buys.` : ''} A buy that matches a receipt you scanned is the same money — count it once, never twice.`;
  }
  return out;
}

function hiddenSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
}
export function hidePlaidAccount(plaidId: string) {
  try {
    const s = hiddenSet(); s.add(plaidId);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
  } catch { /* ignore */ }
}
export function unhidePlaidAccounts(plaidIds: string[]) {
  try {
    const s = hiddenSet(); plaidIds.forEach(id => s.delete(id));
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
  } catch { /* ignore */ }
}

async function postFn(name: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Bank service error (${res.status})`);
  return data;
}

export interface PlaidAccount {
  item_id: string; institution: string | null; account_id: string;
  name: string; type: string; subtype: string | null;
  balance: number | null; available: number | null; last4: string | null;
}

export async function fetchPlaidAccounts(): Promise<PlaidAccount[]> {
  const data = await postFn('plaid-accounts', { device_id: deviceId() });
  return (data.accounts ?? []) as PlaidAccount[];
}

export function plaidKind(type: string, subtype: string | null): AccountKind {
  if (type === 'credit') return 'credit';
  if (type === 'depository') return subtype === 'savings' || subtype === 'money market' || subtype === 'cd' ? 'savings' : 'checking';
  // Loans and investments land in 'other' so they never inflate liquid money
  // or get double-counted as credit-card debt.
  return 'other';
}

/** Merge fresh bank accounts into the local list: update balances of linked
 *  accounts in place (with history), add newly linked ones, skip any the
 *  user deleted (tombstoned). Manual accounts pass through untouched. */
export function mergePlaidAccounts(local: Account[], remote: PlaidAccount[]): Account[] {
  const hidden = hiddenSet();
  const out = [...local];
  for (const r of remote) {
    if (hidden.has(r.account_id)) continue;
    // v1.28.7: the bank's own app shows the AVAILABLE balance, not the
    // current balance (which still counts pending holds). For depository
    // accounts (checking/savings) prefer available when Plaid reports it.
    // Credit/other keep current — for credit, available is remaining
    // credit, not money owed, so it must never stand in for the balance.
    const useAvailable = r.type === 'depository' && typeof r.available === 'number';
    const raw = useAvailable ? r.available! : r.balance;
    const bal = typeof raw === 'number' ? Math.round(raw * 100) / 100 : 0;
    const idx = out.findIndex(a => a.plaidId === r.account_id);
    if (idx >= 0) {
      const a = out[idx];
      // Update on balance change, and also backfill bank grouping metadata
      // (plaidItem) for accounts linked before the multi-bank manager existed.
      if (a.balance !== bal || a.plaidItem !== r.item_id) {
        out[idx] = {
          ...a, plaidItem: r.item_id,
          name: r.name || a.name, institution: r.institution || a.institution, last4: r.last4 || a.last4,
          ...(a.balance !== bal ? { balance: bal, history: [...a.history.slice(-11), { at: Date.now(), balance: bal }], updatedAt: Date.now() } : {}),
        };
      }
    } else {
      out.unshift({
        id: 'plaid-' + r.account_id, name: r.name || 'Bank account',
        kind: plaidKind(r.type, r.subtype), balance: bal,
        history: [{ at: Date.now(), balance: bal }], updatedAt: Date.now(),
        plaidId: r.account_id, institution: r.institution || undefined, last4: r.last4 || undefined,
        plaidItem: r.item_id,
      });
    }
  }
  return out;
}

/* ------- Bank purchases (v1.28.14) -------
   The app used to sync balances only, so a card buy never appeared
   anywhere. The link token already asks Plaid for the `transactions`
   product, so linked banks carry the permission — this pulls the last
   30 days of buys into localStorage next to the balances. Until the
   `plaid-transactions` edge function is deployed the fetch fails and
   every caller treats that as "no purchases yet" — balances never break. */

export interface BankTransaction {
  id: string; accountId: string; itemId?: string; institution?: string;
  merchant: string; name: string; amount: number; // > 0 = money out, < 0 = money in (refund/payback)
  date: string; // YYYY-MM-DD
  pending: boolean; category: string[]; pfc: string | null;
}

const TXN_KEY = 'priceamnesia:plaid-transactions';
const TXN_SYNC_KEY = 'priceamnesia:plaid-txn-synced-at';
const TXN_WINDOW_DAYS = 30;
const TXN_MAX = 500;

export function loadTransactions(): BankTransaction[] {
  try {
    const a = JSON.parse(localStorage.getItem(TXN_KEY) || '[]');
    return Array.isArray(a) ? (a as BankTransaction[]) : [];
  } catch { return []; }
}
export function saveTransactions(t: BankTransaction[]) {
  try { localStorage.setItem(TXN_KEY, JSON.stringify(t)); } catch { /* full */ }
}
export function lastTxnSyncedAt(): number {
  try { return Number(localStorage.getItem(TXN_SYNC_KEY) || 0); } catch { return 0; }
}

export interface PlaidTransactionRaw {
  transaction_id: string; account_id: string; item_id?: string; institution?: string | null;
  name: string; merchant_name?: string | null; amount: number; date: string; pending: boolean;
  category?: string[]; pfc_primary?: string | null;
}

export async function fetchPlaidTransactions(): Promise<{ transactions: BankTransaction[]; productNotReady: boolean }> {
  const data = await postFn('plaid-transactions', { device_id: deviceId() });
  const raw = (data.transactions ?? []) as PlaidTransactionRaw[];
  return {
    transactions: raw.map(t => ({
      id: t.transaction_id, accountId: t.account_id, itemId: t.item_id, institution: t.institution || undefined,
      merchant: (t.merchant_name || t.name || 'Purchase').trim(),
      name: (t.name || '').trim(), amount: typeof t.amount === 'number' ? t.amount : 0,
      date: t.date || new Date().toISOString().slice(0, 10), pending: t.pending === true,
      category: Array.isArray(t.category) ? t.category : [], pfc: t.pfc_primary ?? null,
    })),
    productNotReady: data.product_not_ready === true,
  };
}

/** Merge fresh buys in: dedupe by transaction id, refresh pending flags,
 *  drop anything older than the 30-day window, newest first. */
export function mergeTransactions(local: BankTransaction[], remote: BankTransaction[]): BankTransaction[] {
  const cutoff = new Date(Date.now() - TXN_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const byId = new Map<string, BankTransaction>();
  for (const t of local) if (t.date >= cutoff) byId.set(t.id, t);
  for (const t of remote) if (t.date >= cutoff) byId.set(t.id, t);
  return [...byId.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, TXN_MAX);
}

/** Fetch + merge + stamp. Throws on network failure so callers can stay
 *  silent or report, as fits their surface. */
export async function syncPlaidTransactions(): Promise<BankTransaction[]> {
  const { transactions } = await fetchPlaidTransactions();
  const merged = mergeTransactions(loadTransactions(), transactions);
  saveTransactions(merged);
  try { localStorage.setItem(TXN_SYNC_KEY, String(Date.now())); } catch { /* ignore */ }
  return merged;
}

/** Balances + purchases together. A purchases failure (function not yet
 *  deployed, bank still gathering) never sinks the balances — the saved
 *  buys simply carry over until the next refresh. */
export async function syncBankData(local: Account[]): Promise<{ accounts: Account[]; transactions: BankTransaction[] }> {
  const accounts = await syncPlaidAccounts(local);
  let transactions = loadTransactions();
  try { transactions = await syncPlaidTransactions(); } catch { /* balances stand; buys retry next refresh */ }
  return { accounts, transactions };
}

/* ------- Receipt ↔ bank matching (never double-count) ------- */

function normStoreName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Match each scanned receipt to at most one bank buy, and each buy to at
 *  most one receipt: same store (one name contains the other), same amount
 *  to the cent, dates within 2 days. Greedy by closest date. Returns
 *  transaction id -> receipt id. Receipts stay the source for per-item
 *  prices — Plaid only knows the store total. */
export function matchReceipts(receipts: Receipt[], txns: BankTransaction[]): Map<string, string> {
  const out = new Map<string, string>();
  const usedReceipts = new Set<string>();
  const buys = txns.filter(t => t.amount > 0);
  const cands: { txn: BankTransaction; r: Receipt; gap: number }[] = [];
  for (const t of buys) {
    const tn = normStoreName(t.merchant);
    const tn2 = normStoreName(t.name);
    for (const r of receipts) {
      const rn = normStoreName(r.store);
      if (!rn || !tn) continue;
      const nameHit = tn.includes(rn) || rn.includes(tn) || (tn2 && (tn2.includes(rn) || rn.includes(tn2)));
      if (!nameHit) continue;
      if (Math.abs(t.amount - r.total) >= 0.005) continue;
      const gap = Math.abs(new Date(t.date + 'T12:00:00').getTime() - new Date(r.date + 'T12:00:00').getTime()) / 864e5;
      if (gap > 2) continue;
      cands.push({ txn: t, r, gap });
    }
  }
  cands.sort((a, b) => a.gap - b.gap);
  for (const c of cands) {
    if (out.has(c.txn.id) || usedReceipts.has(c.r.id)) continue;
    out.set(c.txn.id, c.r.id);
    usedReceipts.add(c.r.id);
  }
  return out;
}

/** Buys with no matching scanned receipt — the ones that still need to
 *  count toward budgets and month totals. */
export function unmatchedTransactions(receipts: Receipt[], txns: BankTransaction[]): BankTransaction[] {
  const matched = matchReceipts(receipts, txns);
  return txns.filter(t => !matched.has(t.id));
}

/** Money out this month from a list of buys (refunds and money-in excluded). */
export function monthOutflow(txns: BankTransaction[], now = new Date()): number {
  return txns.filter(t => {
    if (t.amount <= 0) return false;
    const d = new Date(t.date + 'T12:00:00');
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).reduce((s, t) => s + t.amount, 0);
}

/** Which monthly budget category a bank buy belongs to. Store keywords
 *  win (a Shell buy is gas even if Plaid calls it food); Plaid's own
 *  category is the fallback. */
export function txnBudgetCat(t: BankTransaction): string {
  const cat = detectCategory(t.merchant || t.name);
  if (cat === 'groceries' || cat === 'dining' || cat === 'gas' || cat === 'shopping') return cat;
  switch (t.pfc) {
    case 'FOOD_AND_DRINK': return 'groceries';
    case 'TRANSPORT': return 'gas';
    case 'GENERAL_MERCHANDISE': case 'SHOPPING': return 'shopping';
    case 'ENTERTAINMENT': return 'fun';
    default: return 'other';
  }
}

/* ------- Plaid Link (in-WebView) ------- */

/* ------- Link exit button (always-visible way out) ------- */
// Plaid Link draws its own sheet inside the app WebView, and on this phone
// its own close button lands underneath the status bar, out of reach —
// that is why the bank-login screen has no way out. While Link is open the
// app draws its own Exit pill above everything and closes Link through the
// supported handler.exit() call.
let linkCloserEl: HTMLElement | null = null;
function showLinkCloser(handler: { exit: () => void }): () => void {
  hideLinkCloser();
  const b = document.createElement('button');
  b.textContent = '✕  Exit bank login';
  b.setAttribute('type', 'button');
  b.style.cssText = [
    'position:fixed',
    'top:calc(env(safe-area-inset-top, 0px) + 10px)',
    'right:12px',
    'z-index:2147483647',
    'padding:10px 14px',
    'border-radius:999px',
    'border:1px solid rgba(255,255,255,0.35)',
    'background:rgba(20,20,30,0.92)',
    'color:#fff',
    'font-size:15px',
    'font-weight:700',
    'font-family:inherit',
    'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
  ].join(';');
  b.addEventListener('click', (e) => { e.stopPropagation(); try { handler.exit(); } catch { /* ignore */ } });
  document.body.appendChild(b);
  linkCloserEl = b;
  // Plaid finishes building its overlay just after open(); put the button
  // on top once more so it never ends up underneath it.
  window.setTimeout(() => { try { document.body.appendChild(b); } catch { /* ignore */ } }, 800);
  return hideLinkCloser;
}
function hideLinkCloser() {
  try { linkCloserEl?.remove(); } catch { /* ignore */ }
  linkCloserEl = null;
}

function loadPlaidScript(): Promise<any> {
  const w = window as any;
  if (w.Plaid) return Promise.resolve(w.Plaid);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve((window as any).Plaid);
    s.onerror = () => reject(new Error('Could not load the bank login. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

/* ------- Multi-bank manager (v1.19) ------- */

export interface LinkedBank { itemId: string | null; institution: string; accounts: Account[] }

/** Group local accounts into their banks. itemId is null only for accounts
 *  linked before grouping metadata existed and not yet re-synced. */
export function groupLinkedBanks(accounts: Account[]): LinkedBank[] {
  const map = new Map<string, LinkedBank>();
  for (const a of accounts) {
    if (!a.plaidId) continue;
    const key = a.plaidItem || `inst:${a.institution || 'Bank'}`;
    if (!map.has(key)) map.set(key, { itemId: a.plaidItem ?? null, institution: a.institution || 'Bank', accounts: [] });
    map.get(key)!.accounts.push(a);
  }
  return [...map.values()];
}

/** Really remove a bank: revoke its token + delete the vault row. */
export async function unlinkBank(itemId: string): Promise<boolean> {
  const data = await postFn('plaid-unlink', { device_id: deviceId(), item_id: itemId });
  return data?.removed === true;
}

/** Repair a broken bank login (password changed, bank re-auth): opens the
 *  bank's own login in update mode for the existing link. */
export async function openBankUpdate(itemId: string): Promise<LinkResult> {
  try {
    const { link_token } = await postFn('plaid-link-token', { device_id: deviceId(), item_id: itemId });
    if (!link_token) return { linked: false, message: 'The bank service did not answer. Try again in a moment.' };
    const Plaid = await loadPlaidScript();
    return await new Promise<LinkResult>((resolve) => {
      let settled = false;
      const done = (r: LinkResult) => { if (!settled) { settled = true; hideLinkCloser(); resolve(r); } };
      const handler = Plaid.create({
        token: link_token,
        onSuccess: () => done({ linked: true, message: 'Reconnected ✓ — balances will refresh now.' }),
        onExit: (err: any) => {
          if (err) done({ linked: false, message: 'The bank login stopped before finishing — the old link is unchanged.' });
          else done({ linked: false, message: 'Closed — the old link is unchanged.' });
        },
      });
      showLinkCloser(handler);
      handler.open();
    });
  } catch (e: any) {
    return { linked: false, message: e?.message || 'Reconnect is not reachable right now.' };
  }
}

export interface LinkResult { linked: boolean; message: string }

/** Full flow: link token → bank's own login sheet → exchange → done.
 *  Resolves (never rejects) with a plain-language outcome. */
export async function openBankLink(): Promise<LinkResult> {
  try {
    const { link_token } = await postFn('plaid-link-token', { device_id: deviceId() });
    if (!link_token) return { linked: false, message: 'The bank service did not answer. Try again in a moment.' };
    const Plaid = await loadPlaidScript();
    return await new Promise<LinkResult>((resolve) => {
      let settled = false;
      const done = (r: LinkResult) => { if (!settled) { settled = true; hideLinkCloser(); resolve(r); } };
      const handler = Plaid.create({
        token: link_token,
        onSuccess: async (publicToken: string, metadata: any) => {
          try {
            await postFn('plaid-exchange', {
              public_token: publicToken,
              device_id: deviceId(),
              institution_name: metadata?.institution?.name ?? null,
            });
            try { localStorage.setItem(LINKED_KEY, '1'); } catch { /* ignore */ }
            done({ linked: true, message: `Linked ${metadata?.institution?.name || 'your bank'} ✓ — balances will stay fresh on their own.` });
          } catch (e: any) {
            done({ linked: false, message: e?.message || 'Linking finished but saving the link failed. Try once more.' });
          }
        },
        onExit: (err: any) => {
          if (err) done({ linked: false, message: 'The bank login stopped before finishing. You can try again — nothing was linked.' });
          else done({ linked: false, message: 'Closed — nothing was linked.' });
        },
      });
      showLinkCloser(handler);
      handler.open();
    });
  } catch (e: any) {
    return { linked: false, message: e?.message || 'Bank linking is not reachable right now.' };
  }
}
