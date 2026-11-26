import { BillRecord } from './bills';
import { Receipt, budgetCatOf } from './store';
import { LedgerEntry } from './bank';
import { BankTransaction, matchReceipts, txnBudgetCat } from './plaid';

/* Monthly budgets — limits stored once, spending computed fresh from
   the app's real data: groceries from receipts, bills from Bill Lens,
   everything else from categorized Bank-hub expense logs. */

export type BudgetSource = 'mixed' | 'bills';
export interface BudgetCat { id: string; icon: string; label: string; source: BudgetSource; def: number }
export const BUDGET_CATS: BudgetCat[] = [
  { id: 'groceries', icon: '🛒', label: 'Groceries', source: 'mixed', def: 400 },
  { id: 'bills', icon: '💡', label: 'Bills', source: 'bills', def: 300 },
  { id: 'dining', icon: '🍔', label: 'Dining out', source: 'mixed', def: 120 },
  { id: 'gas', icon: '⛽', label: 'Gas & travel', source: 'mixed', def: 150 },
  { id: 'fun', icon: '🎉', label: 'Fun', source: 'mixed', def: 80 },
  { id: 'shopping', icon: '🛍️', label: 'Shopping', source: 'mixed', def: 100 },
  { id: 'other', icon: '📦', label: 'Other spending', source: 'mixed', def: 80 },
];

const KEY = 'priceamnesia:budgets';
export function loadBudgets(): Record<string, number> {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (b && typeof b === 'object') return b;
  } catch { /* fall through */ }
  return {};
}
export function saveBudgets(b: Record<string, number>) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* full */ }
}
export function budgetFor(cat: BudgetCat, budgets: Record<string, number>): number {
  const v = budgets[cat.id];
  return typeof v === 'number' && v >= 0 ? v : cat.def;
}

const sameMonth = (dateStr: string, now: Date) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

export function catSpent(cat: BudgetCat, receipts: Receipt[], bills: BillRecord[], ledger: LedgerEntry[], now = new Date(), unmatchedTxns: BankTransaction[] = []): number {
  if (cat.source === 'bills') return bills.filter(b => b.dueDate && b.amountDue !== null && sameMonth(b.dueDate, now)).reduce((s, b) => s + (b.amountDue || 0), 0);
  /* v1.14: every non-bill category is fed by BOTH its receipts and its
     logged expenses — a Shell receipt counts toward Gas exactly like
     a logged gas expense; uncategorized receipts land via detect. */
  const fromReceipts = receipts.filter(r => sameMonth(r.date, now) && budgetCatOf(r) === cat.id).reduce((s, r) => s + r.total, 0);
  const fromLedger = ledger.filter(l => l.kind === 'expense' && (l.category || 'other') === cat.id && sameMonth(l.date, now)).reduce((s, l) => s + l.amount, 0);
  /* v1.28.14: bank card buys count too — but only the ones with NO matching
     scanned receipt, so a Safeway buy is never counted twice. */
  const fromBank = unmatchedTxns.filter(t => t.amount > 0 && sameMonth(t.date, now) && txnBudgetCat(t) === cat.id).reduce((s, t) => s + t.amount, 0);
  return fromReceipts + fromLedger + fromBank;
}

export interface BudgetRow { cat: BudgetCat; limit: number; spent: number; left: number; pct: number; state: 'ok' | 'hot' | 'over' }
export function budgetRows(budgets: Record<string, number>, receipts: Receipt[], bills: BillRecord[], ledger: LedgerEntry[], now = new Date(), transactions: BankTransaction[] = []): BudgetRow[] {
  const elapsed = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Match once per render, not once per category.
  const matched = matchReceipts(receipts, transactions);
  const unmatched = transactions.filter(t => !matched.has(t.id));
  return BUDGET_CATS.map(cat => {
    const limit = budgetFor(cat, budgets);
    const spent = catSpent(cat, receipts, bills, ledger, now, unmatched);
    const pct = limit > 0 ? spent / limit : 0;
    const state: BudgetRow['state'] = pct >= 1 ? 'over' : pct > elapsed + 0.15 && pct >= 0.6 ? 'hot' : 'ok';
    return { cat, limit, spent, left: limit - spent, pct, state };
  });
}

export function daysLeftInMonth(now = new Date()): number {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, last - now.getDate() + 1);
}

export function localBudgetAdvice(rows: BudgetRow[], now = new Date()): string[] {
  const out: string[] = [];
  const over = rows.filter(r => r.state === 'over');
  const hot = rows.filter(r => r.state === 'hot');
  for (const r of over) out.push(`🔴 ${r.cat.label} is over budget — ${fmt(r.spent)} of ${fmt(r.limit)}. The month's remaining room has to come from somewhere; check the categories still in the green.`);
  for (const r of hot) out.push(`🟠 ${r.cat.label} is pacing hot: ${Math.round(r.pct * 100)}% spent with ${Math.round((1 - now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)}% of the month still to go. Easing off now is cheaper than catching up later.`);
  const totalLeft = rows.reduce((s, r) => s + r.left, 0);
  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  if (totalLimit > 0 && over.length === 0) {
    out.push(`Overall you're at ${fmt(totalSpent)} of ${fmt(totalLimit)} — ${fmt(totalLeft)} of room left, about ${fmt(totalLeft / daysLeftInMonth(now))} per remaining day.`);
  }
  if (out.length === 0) out.push('Every category is on pace. This is what a calm month looks like — keep the rhythm.');
  return out;
}
const fmt = (n: number) => '$' + n.toFixed(2);
