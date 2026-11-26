import { BillRecord } from './bills';
import { Receipt } from './store';

/* Bank & Cash Flow hub — accounts tracked on-device (manual balances
   until the Plaid switch-on). Analysis fuses three real sources:
   accounts, Bill Lens bills, and grocery receipts. */

export type AccountKind = 'checking' | 'savings' | 'credit' | 'cash' | 'other';
export interface Account {
  id: string; name: string; kind: AccountKind; balance: number;
  history: { at: number; balance: number }[]; updatedAt: number;
  /** Set when this account is fed by a linked bank: balances auto-refresh. */
  plaidId?: string; institution?: string; last4?: string;
  /** The bank link (Plaid item) this account belongs to — groups accounts
   *  per bank for the manager (Reconnect / Remove bank). */
  plaidItem?: string;
}
export interface LedgerEntry { id: string; kind: 'income' | 'expense'; label: string; amount: number; date: string; createdAt: number; category?: string }

/* Linked-bank helpers (v1.18) — pure account math shared by Home, bills,
   budgets and the calm layer. */
export function linkedAccounts(a: Account[]): Account[] { return a.filter(x => x.plaidId); }
export function linkedLiquid(a: Account[]): number {
  return a.filter(x => x.plaidId && (x.kind === 'checking' || x.kind === 'savings' || x.kind === 'cash'))
    .reduce((s, x) => s + x.balance, 0);
}
export function primaryLinked(a: Account[]): Account | null {
  const l = a.filter(x => x.plaidId && (x.kind === 'checking' || x.kind === 'savings'));
  return l.sort((x, y) => y.balance - x.balance)[0] ?? null;
}

const ACC_KEY = 'priceamnesia:accounts';
const LED_KEY = 'priceamnesia:ledger';

export const KIND_ICONS: Record<AccountKind, string> = { checking: '🏦', savings: '🐷', credit: '💳', cash: '💵', other: '📁' };
export const DEBT_KINDS: AccountKind[] = ['credit'];

export function loadAccounts(): Account[] {
  try { const a = JSON.parse(localStorage.getItem(ACC_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function saveAccounts(a: Account[]) {
  try { localStorage.setItem(ACC_KEY, JSON.stringify(a)); } catch { /* full */ }
}
export function loadLedger(): LedgerEntry[] {
  try { const a = JSON.parse(localStorage.getItem(LED_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function saveLedger(l: LedgerEntry[]) {
  try { localStorage.setItem(LED_KEY, JSON.stringify(l)); } catch { /* full */ }
}

export interface MoneyPicture {
  liquid: number;        // checking + savings + cash
  debt: number;          // credit balances owed
  net: number;           // liquid + other assets - debt
  dueNext14: number;     // bills due in the next 14 days (incl. overdue)
  dueCount: number;
  covered: boolean;      // liquid covers what's due
  monthIn: number;       // logged income this month
  monthGroceries: number;
  monthBills: number;    // bills whose due date falls this month
  monthOtherOut: number; // logged expenses this month
  monthBank: number;     // v1.28.14: bank card buys this month with NO matching receipt (matched buys already count in monthGroceries)
  monthOut: number;
  monthNet: number;
}

const inThisMonth = (dateStr: string, now: Date) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

export function moneyPicture(accounts: Account[], bills: BillRecord[], receipts: Receipt[], ledger: LedgerEntry[], now = new Date(), monthBank = 0): MoneyPicture {
  const liquid = accounts.filter(a => a.kind === 'checking' || a.kind === 'savings' || a.kind === 'cash').reduce((s, a) => s + a.balance, 0);
  const otherAssets = accounts.filter(a => a.kind === 'other').reduce((s, a) => s + a.balance, 0);
  const debt = accounts.filter(a => DEBT_KINDS.includes(a.kind)).reduce((s, a) => s + a.balance, 0);
  const horizon = now.getTime() + 14 * 864e5;
  const due = bills.filter(b => b.dueDate && b.amountDue !== null && new Date(b.dueDate + 'T12:00:00').getTime() <= horizon);
  const dueNext14 = due.reduce((s, b) => s + (b.amountDue || 0), 0);
  const monthIn = ledger.filter(l => l.kind === 'income' && inThisMonth(l.date, now)).reduce((s, l) => s + l.amount, 0);
  const monthOtherOut = ledger.filter(l => l.kind === 'expense' && inThisMonth(l.date, now)).reduce((s, l) => s + l.amount, 0);
  const monthGroceries = receipts.filter(r => inThisMonth(r.date, now)).reduce((s, r) => s + r.total, 0);
  const monthBills = bills.filter(b => b.dueDate && b.amountDue !== null && inThisMonth(b.dueDate, now)).reduce((s, b) => s + (b.amountDue || 0), 0);
  const monthOut = monthGroceries + monthBills + monthOtherOut + monthBank;
  return {
    liquid, debt, net: liquid + otherAssets - debt,
    dueNext14, dueCount: due.length, covered: liquid >= dueNext14,
    monthIn, monthGroceries, monthBills, monthOtherOut, monthBank, monthOut,
    monthNet: monthIn - monthOut,
  };
}

/** Rule-based suggestions (the honest local brain behind the AI coach). */
export function localBankSuggestions(p: MoneyPicture, accounts: Account[]): string[] {
  const out: string[] = [];
  if (accounts.length === 0) return ['Add your first account above — even a rough balance. Echo can\'t watch money she can\'t see.'];
  if (p.dueNext14 > 0 && !p.covered) {
    out.push(`⚠️ Heads up: ${p.dueCount} bill${p.dueCount === 1 ? '' : 's'} totaling $${p.dueNext14.toFixed(2)} come due in the next 14 days, but your liquid accounts hold $${p.liquid.toFixed(2)}. That gap is the first thing to close.`);
  } else if (p.dueNext14 > 0) {
    out.push(`✅ Your next 14 days of bills ($${p.dueNext14.toFixed(2)}) are covered by your liquid $${p.liquid.toFixed(2)} — calm waters.`);
  }
  if (p.debt > 0) {
    const spare = p.liquid - p.dueNext14;
    out.push(spare > 50
      ? `💳 You owe $${p.debt.toFixed(2)} on credit. After covering due bills you'd still have $${spare.toFixed(2)} liquid — throwing even part of that at the card beats savings interest almost every time.`
      : `💳 You owe $${p.debt.toFixed(2)} on credit. Priority one is covering due bills; any extra after that belongs on the card — it's the most expensive money you hold.`);
  }
  if (p.monthOut > 0) {
    const months = p.liquid / Math.max(1, p.monthOut);
    out.push(`🛟 Your liquid money covers about ${months.toFixed(1)} month${months >= 1.95 ? 's' : ''} of your tracked spending. Three months is the classic calm-money target.`);
  }
  if (p.monthIn > 0 && p.monthNet < 0) {
    out.push(`📉 This month you're tracking $${Math.abs(p.monthNet).toFixed(2)} more out than in. The Deals Hub and your bills list show exactly where the out is going.`);
  }
  if (out.length === 0) out.push('Everything tracked looks calm. Keep the balances fresh and I\'ll keep watching the gaps before they open.');
  return out;
}
