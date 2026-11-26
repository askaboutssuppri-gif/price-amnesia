// Price Amnesia — habit engine (v1.20). Advice built from the user's OWN
// patterns: where they actually eat, what they actually rebuy, and the
// cheaper sightings already sitting in their price memory. Every line is
// an observation + a specific swap + a dollar effect, tied to whichever
// money goal is live right now. No generic tips, no invented prices —
// every number traces to a receipt or a sighting on this phone.
import { Receipt, PriceEntry, ItemStats, receiptCatOf } from './store';
import { BillRecord } from './bills';
import { Account, LedgerEntry, moneyPicture } from './bank';
import { budgetRows } from './budget';

const fmt = (n: number) => '$' + n.toFixed(2);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const inMonth = (dateStr: string, key: string) => (dateStr || '').startsWith(key);

export interface HabitInput {
  receipts: Receipt[]; entries: PriceEntry[]; stats: ItemStats[];
  bills: BillRecord[]; accounts: Account[]; ledger: LedgerEntry[];
  budgets: Record<string, number>;
}

/* ---------- dining pattern ---------- */
export interface DiningPattern { count: number; total: number; avg: number; topStore: string; topStoreCount: number; lastMonthTotal: number }
export function diningPattern(receipts: Receipt[], now = new Date()): DiningPattern | null {
  const mk = monthKey(now);
  const lm = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const dine = receipts.filter(r => receiptCatOf(r) === 'dining');
  const thisM = dine.filter(r => inMonth(r.date, mk));
  if (thisM.length === 0) return null;
  const total = thisM.reduce((s, r) => s + r.total, 0);
  const byStore = new Map<string, number>();
  thisM.forEach(r => byStore.set(r.store, (byStore.get(r.store) || 0) + 1));
  const top = [...byStore.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    count: thisM.length, total, avg: total / thisM.length,
    topStore: top[0], topStoreCount: top[1],
    lastMonthTotal: dine.filter(r => inMonth(r.date, lm)).reduce((s, r) => s + r.total, 0),
  };
}

/* ---------- cheaper-store swaps from the user's own sightings ---------- */
export interface Swap { name: string; lastStore: string; lastUnit: number; cheapStore: string; cheapUnit: number; unitSave: number; timesBought: number; monthlySave: number }
const unitOf = (e: PriceEntry) => (e.quantity && e.quantity > 0 ? e.price / e.quantity : e.price);
export function swapOpportunities(stats: ItemStats[], now = new Date()): Swap[] {
  const out: Swap[] = [];
  for (const s of stats) {
    if (s.history.length < 2) continue;
    const last = s.history[s.history.length - 1];
    const lastUnit = unitOf(last);
    let cheap: PriceEntry | null = null; let cheapUnit = Infinity;
    for (const h of s.history) {
      if (h.store === last.store) continue;
      const u = unitOf(h);
      if (u < cheapUnit) { cheapUnit = u; cheap = h; }
    }
    if (!cheap) continue;
    const unitSave = lastUnit - cheapUnit;
    if (unitSave < Math.max(0.4, lastUnit * 0.1)) continue; // ignore noise-level differences
    const first = new Date(s.history[0].date).getTime();
    const months = Math.max(1, (now.getTime() - first) / (30 * 864e5));
    out.push({
      name: s.displayName, lastStore: last.store, lastUnit, cheapStore: cheap.store, cheapUnit,
      unitSave, timesBought: s.count, monthlySave: unitSave * (s.count / months),
    });
  }
  return out.sort((a, b) => b.monthlySave - a.monthlySave).slice(0, 3);
}

/* ---------- the live goal ---------- */
export interface MoneyGoal { kind: 'gap' | 'budget' | 'cushion' | 'debt'; amount: number; label: string }
export function pickGoal(inp: HabitInput, now = new Date()): MoneyGoal | null {
  const pic = moneyPicture(inp.accounts, inp.bills, inp.receipts, inp.ledger, now);
  if (pic.dueNext14 > 0 && !pic.covered) {
    return { kind: 'gap', amount: pic.dueNext14 - pic.liquid, label: `the ${fmt(pic.dueNext14)} of bills landing in the next 14 days` };
  }
  const over = budgetRows(inp.budgets, inp.receipts, inp.bills, inp.ledger, now).find(r => r.state === 'over');
  if (over) return { kind: 'budget', amount: -over.left, label: `bringing ${over.cat.label} back under its ${fmt(over.limit)} line` };
  if (inp.accounts.length > 0 && pic.liquid > 0 && pic.liquid < 500) {
    return { kind: 'cushion', amount: 500 - pic.liquid, label: 'building a $500 cushion' };
  }
  if (pic.debt > 0) return { kind: 'debt', amount: pic.debt, label: `chipping at the ${fmt(pic.debt)} card balance` };
  return null;
}

/* ---------- advice lines ---------- */
export function habitAdvice(inp: HabitInput, now = new Date()): string[] {
  const out: string[] = [];
  const goal = pickGoal(inp, now);
  const tie = (amt: number) => {
    if (!goal || amt <= 0) return '';
    return amt >= goal.amount
      ? ` That alone more than covers your current goal: ${goal.label} (${fmt(goal.amount)}).`
      : ` That's ${Math.round(amt / goal.amount * 100)}% of your current goal: ${goal.label} (${fmt(goal.amount)}).`;
  };
  const dine = diningPattern(inp.receipts, now);
  if (dine && dine.lastMonthTotal > 0 && dine.total < dine.lastMonthTotal - 5) {
    out.push(`📉 Dining is down ${fmt(dine.lastMonthTotal - dine.total)} vs last month — that habit shift is already real money. Whatever you did, it's working.`);
  }
  if (dine && dine.count >= 3 && dine.total >= 40) {
    const lever = dine.avg * 2;
    out.push(`🍔 Dining out: ${dine.count} stops this month for ${fmt(dine.total)} — about ${fmt(dine.avg)} a stop${dine.topStoreCount >= 2 ? `, mostly ${dine.topStore}` : ''}. Two fewer stops is roughly ${fmt(lever)} back in your pocket.${tie(lever)}`);
  }
  const swaps = swapOpportunities(inp.stats, now);
  for (const sw of swaps.slice(0, 2)) {
    out.push(`🛒 ${sw.name}: you last paid ${fmt(sw.lastUnit)} at ${sw.lastStore}, but your own price history has it at ${fmt(sw.cheapUnit)} at ${sw.cheapStore} — same item, ${fmt(sw.unitSave)} saved every time. You've bought it ${sw.timesBought} times, so that habit is worth about ${fmt(sw.monthlySave)} a month.`);
  }
  if (dine && dine.count >= 3) {
    const groceries = inp.receipts.filter(r => receiptCatOf(r) === 'groceries' && inMonth(r.date, monthKey(now))).reduce((s, r) => s + r.total, 0);
    if (groceries > 0 && dine.total > groceries * 0.6) {
      out.push(`🏠 Kitchen math: dining ran ${fmt(dine.total)} this month against ${fmt(groceries)} of groceries. A home-cooked meal usually lands near a third of a ${fmt(dine.avg)} dining stop — swapping just one stop a week moves about ${fmt(dine.avg * 0.65 * 4)} a month toward groceries you control.`);
    }
  }
  if (goal && out.length >= 2) {
    const dineLever = dine && dine.count >= 3 ? dine.avg * 2 : 0;
    const swapLever = swaps.length ? swaps[0].monthlySave : 0;
    const sum = dineLever + swapLever;
    if (dineLever > 0 && swapLever > 0 && sum >= goal.amount * 0.5) {
      out.push(`🎯 Put the two together — two fewer dining stops (${fmt(dineLever)}) plus buying ${swaps[0].name} at ${swaps[0].cheapStore} (${fmt(swapLever)}/month) ≈ ${fmt(sum)} — aimed straight at ${goal.label}. Small levers, real target.`);
    }
  }
  return out.slice(0, 4);
}

/* ---------- compact context for Echo's AI surfaces ---------- */
export function habitContextLine(inp: HabitInput, now = new Date()): string {
  const parts: string[] = [];
  const dine = diningPattern(inp.receipts, now);
  if (dine && dine.count >= 2) parts.push(`Dining out: ${dine.count} stops, ${fmt(dine.total)} this month, avg ${fmt(dine.avg)}, mostly ${dine.topStore}${dine.lastMonthTotal > 0 ? ` (last month ${fmt(dine.lastMonthTotal)})` : ''}.`);
  const swaps = swapOpportunities(inp.stats, now);
  if (swaps.length) parts.push('Cheaper-store habits available: ' + swaps.map(s => `${s.name} ${fmt(s.lastUnit)} at ${s.lastStore} vs ${fmt(s.cheapUnit)} at ${s.cheapStore}`).join('; ') + '.');
  const goal = pickGoal(inp, now);
  if (goal) parts.push(`Current money goal: ${goal.label} — ${fmt(goal.amount)} to go.`);
  return parts.length ? 'Spending habits (from their own receipts): ' + parts.join(' ') : '';
}
