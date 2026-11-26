import { BillRecord, daysUntil } from './bills';
import { Receipt, PriceEntry, ItemStats } from './store';
import { Account, LedgerEntry, moneyPicture, primaryLinked } from './bank';
import { budgetRows } from './budget';
import { atTheirLow } from './deals';
import { diningPattern, swapOpportunities } from './habits';

/* Calm layer (v1.16, research-backed) — the app hides its richness
   and answers ONE question on Home: "Am I OK, and what's my one move?"
   Techniques: progressive disclosure, endowed progress, goal
   gradient, peak-end. Copy rule: situation + next step, never shame. */

export interface CalmInput {
  receipts: Receipt[]; entries: PriceEntry[]; stats: ItemStats[];
  bills: BillRecord[]; accounts: Account[]; ledger: LedgerEntry[];
  budgets: Record<string, number>;
}

export interface Move {
  icon: string; title: string; body: string; cta: string;
  target: 'bills' | 'bank' | 'deals' | 'scan' | 'wellness' | 'briefing' | 'none';
  tone: 'calm' | 'attention' | 'celebrate';
}

export function oneMove(inp: CalmInput, now = new Date()): Move {
  const overdue = inp.bills.filter(b => b.dueDate && daysUntil(b.dueDate, now) < 0)
    .sort((a, b) => daysUntil(a.dueDate!, now) - daysUntil(b.dueDate!, now))[0];
  if (overdue) return {
    icon: '📄', tone: 'attention', target: 'bills', cta: 'Handle this bill',
    title: `${overdue.biller} needs a look`,
    body: `It's ${Math.abs(daysUntil(overdue.dueDate!, now))} day${Math.abs(daysUntil(overdue.dueDate!, now)) === 1 ? '' : 's'} past its due date. One tap opens its pay link, nearby pay locations, and your options.`,
  };
  const soon = inp.bills.filter(b => b.dueDate && daysUntil(b.dueDate, now) >= 0 && daysUntil(b.dueDate, now) <= 3)
    .sort((a, b) => daysUntil(a.dueDate!, now) - daysUntil(b.dueDate!, now))[0];
  if (soon) {
    const pic = moneyPicture(inp.accounts, inp.bills, inp.receipts, inp.ledger, now);
    const linked = primaryLinked(inp.accounts);
    return {
      icon: '📄', tone: 'attention', target: 'bills', cta: 'See this bill',
      title: `${soon.biller} lands ${daysUntil(soon.dueDate!, now) === 0 ? 'today' : `in ${daysUntil(soon.dueDate!, now)} day${daysUntil(soon.dueDate!, now) === 1 ? '' : 's'}`}`,
      body: linked
        ? (pic.covered
          ? `Good news: your ${linked.name} holds ${fmt(linked.balance)} — everything due in the next two weeks is covered. Nothing to do but glance at it.`
          : `Your ${linked.name} holds ${fmt(linked.balance)}, with ${fmt(pic.dueNext14)} due in the next two weeks. This bill's page has the pay link and your options, in one place.`)
        : inp.accounts.length > 0
          ? (pic.covered ? 'Good news: your liquid money covers everything due in the next two weeks. Nothing to do but glance at it.' : 'Your liquid money does not fully cover what\'s due soon — this bill\'s page has the pay link and your options, in one place.')
          : 'Its page has the pay link and nearby places to pay in person, all in one spot.',
    };
  }
  const rows = budgetRows(inp.budgets, inp.receipts, inp.bills, inp.ledger, now);
  const over = rows.find(r => r.state === 'over');
  if (over) return {
    icon: '🎯', tone: 'attention', target: 'bank', cta: 'Open budgets',
    title: `${over.cat.label} is over its line`,
    body: `By ${fmt(Math.abs(over.left))}. No guilt — budgets are dials, not grades. Adjust the dial or let Echo's coach find the room in another category.`,
  };
  const hot = rows.find(r => r.state === 'hot');
  if (hot) return {
    icon: '🎯', tone: 'calm', target: 'bank', cta: 'Open budgets',
    title: `${hot.cat.label} is pacing a little hot`,
    body: `${Math.round(hot.pct * 100)}% spent with ${fmt(hot.left)} of room left. A small ease-off now keeps the month smooth.`,
  };
  if (inp.receipts.length === 0) return {
    icon: '📸', tone: 'calm', target: 'scan', cta: 'Snap a receipt',
    title: 'Your memory starts with one receipt',
    body: 'Snap any receipt — groceries, gas, dinner, anything. Echo reads it, remembers every price, and starts watching for deals.',
  };
  if (inp.bills.length === 0) return {
    icon: '📄', tone: 'calm', target: 'bills', cta: 'Snap a bill',
    title: 'Let Echo watch a due date',
    body: 'Snap one bill and she reads it, explains it, and keeps the due date on her radar — so it never sneaks up on you.',
  };
  const lows = atTheirLow(inp.stats);
  if (lows.length > 0) return {
    icon: '🎯', tone: 'celebrate', target: 'deals', cta: 'See the deal',
    title: `${cap(lows[0].displayName)} is at its lowest`,
    body: `${fmt(lows[0].price)} at ${lows[0].store} — the cheapest you've ever paid for it. If you use it, today's the stock-up day.`,
  };
  const dine = diningPattern(inp.receipts, now);
  if (dine && dine.count >= 3 && dine.total >= 40) return {
    icon: '🍔', tone: 'calm', target: 'bank', cta: 'See the habit math',
    title: `${dine.count} dining stops this month`,
    body: `${fmt(dine.total)} so far, about ${fmt(dine.avg)} a stop${dine.topStoreCount >= 2 ? ` — mostly ${dine.topStore}` : ''}. Two fewer stops ≈ ${fmt(dine.avg * 2)} back, and your Bank page shows exactly what that money would fund.`,
  };
  const swaps = swapOpportunities(inp.stats, now);
  if (swaps.length > 0) { const sw = swaps[0]; return {
    icon: '🛒', tone: 'calm', target: 'deals', cta: 'See the swap',
    title: `${cap(sw.name)} is cheaper at ${sw.cheapStore}`,
    body: `You last paid ${fmt(sw.lastUnit)} at ${sw.lastStore}; your own history has it at ${fmt(sw.cheapUnit)} at ${sw.cheapStore}. Same item — ${fmt(sw.unitSave)} saved every time you make the switch.`,
  }; }
  if (inp.accounts.length === 0) return {
    icon: '🏦', tone: 'calm', target: 'bank', cta: 'Link your bank',
    title: 'Complete your money picture',
    body: 'Link your bank — it logs you in itself, no password ever touches this app — or add a balance by hand. Then Echo checks every due bill against your real money.',
  };
  return {
    icon: '🌿', tone: 'celebrate', target: 'none', cta: 'Browse your deals',
    title: "You're all caught up",
    body: 'Bills are watched, budgets are on pace, and your prices are remembered. Nothing needs you right now.',
  };
}

export function okLine(inp: CalmInput, now = new Date()): string {
  const move = oneMove(inp, now);
  if (move.tone === 'attention') return 'One thing has your name on it — the move below handles it.';
  if (inp.receipts.length === 0) return 'Let\'s get your memory started — one receipt is all it takes.';
  return '✅ You\'re OK — bills watched, budgets on pace, prices remembered.';
}

/* ---- Journey: endowed progress (never starts at zero) ---- */
export interface Milestone { icon: string; label: string; done: boolean }
export function journey(inp: CalmInput): { steps: Milestone[]; doneCount: number; next: Milestone | null } {
  const steps: Milestone[] = [
    { icon: '🌅', label: 'Echo woke up', done: true }, // endowed — you're already on the board
    { icon: '🧾', label: 'First receipt remembered', done: inp.receipts.length >= 1 },
    { icon: '🕵️', label: '5 prices tracked', done: inp.entries.length >= 5 },
    { icon: '📄', label: 'First bill watched', done: inp.bills.length >= 1 },
    { icon: '🎯', label: 'A budget set by you', done: Object.keys(inp.budgets).length >= 1 },
    { icon: '🏦', label: 'Bank picture started', done: inp.accounts.length >= 1 },
    { icon: '🏆', label: '10 receipts in memory', done: inp.receipts.length >= 10 },
    { icon: '💎', label: '25 prices tracked', done: inp.entries.length >= 25 },
  ];
  const doneCount = steps.filter(s => s.done).length;
  return { steps, doneCount, next: steps.find(s => !s.done) || null };
}

const fmt = (n: number) => '$' + n.toFixed(2);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
