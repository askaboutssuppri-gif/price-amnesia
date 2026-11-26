// Echo's cloud brain — optional upgrade via the Supabase Edge Function
// 'echo-chat' (Groq llama-3.3-70b) in the user's price-amnesia project.
// NOT live until the user deploys it (one paste — see the setup file).
// The app sends a compact summary of the user's price history as context,
// so Echo can answer like someone who knows your shelves.
// Any failure -> null, and the caller falls back to the on-device brain.

import { ItemStats, money } from './store';
import { getAccessToken } from './supabase';

const FN_URL = 'https://alldcvtfohwqtaalebxr.supabase.co/functions/v1/echo-chat';

export function buildContext(stats: ItemStats[]): string {
  if (stats.length === 0) return 'The user has not logged any prices yet.';
  const lines = stats.slice(0, 40).map(s =>
    `${s.displayName}: last ${money(s.lastPrice)} at ${s.lastStore}, avg ${money(s.avg)}, low ${money(s.low)}, high ${money(s.high)}, seen ${s.count}x`
  );
  return 'User price history (from their own receipts):\n' + lines.join('\n');
}

export async function askCloud(question: string, context: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    // Signed in? Send the user token so the function can see who is asking.
    // Signed out? The call goes without it, exactly as before (JWT is OFF).
    const token = await getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, context }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const reply = data?.reply;
    return typeof reply === 'string' && reply.trim() ? reply.trim() : null;
  } catch {
    return null;
  }
}


/* ---------- v1.6: deeper AI — briefing, deals analyst, deep dive ---------- */

import { Receipt } from './store';
import { storeBattle, atTheirLow, smartBasket } from './deals';

export function buildDealsContext(stats: ItemStats[], entries: import('./store').PriceEntry[], receipts: Receipt[]): string {
  const parts: string[] = [buildContext(stats)];
  const battle = storeBattle(entries);
  if (battle.standings.length > 0) {
    parts.push('Store standings (most item wins): ' + battle.standings.map(s => `${s.store} ${s.wins}`).join(', '));
    parts.push('Biggest store gaps: ' + battle.rows.slice(0, 5).map(r => `${r.displayName} cheapest at ${r.cheapestStore} ${money(r.cheapestPrice)} vs ${r.priciestStore} ${money(r.priciestPrice)} (-${r.gapPct}%)`).join('; '));
  }
  const lows = atTheirLow(stats);
  if (lows.length > 0) parts.push('Currently at all-time low: ' + lows.map(l => `${l.displayName} ${money(l.price)} at ${l.store}`).join(', '));
  const basket = smartBasket(stats, entries);
  if (basket.lines.length > 0) parts.push(`Repeat-item basket: best-price total ${money(basket.bestTotal)} vs last-paid total ${money(basket.lastTotal)} (possible saving ${money(basket.saveTotal)}).`);
  const spent = receipts.reduce((a, r) => a + r.total, 0);
  parts.push(`Receipts logged: ${receipts.length}, total spent across them: ${money(spent)}.`);
  return parts.join('\n');
}

export const BRIEFING_QUESTION = 'Write my weekly grocery briefing. Cover: my biggest price win right now, anything creeping up that I should watch, what I should stock up on, and the one smartest move for my next shop. Use only my history in the context — be specific with my items, stores and prices.';
export const ANALYST_QUESTION = 'Analyze my deals like a strategist. Which store should I favor for which items, what should I stock up on right now, and where am I overpaying compared to my own history? Be specific with items, stores and prices from the context.';

/* On-device fallbacks — used when the cloud brain can't be reached.
   Locally composed from the same facts, and labeled as on-device. */
export function localBriefing(stats: ItemStats[], entries: import('./store').PriceEntry[], receipts: Receipt[]): string {
  if (stats.length === 0) return "You haven't logged any prices yet, so this briefing is short: snap your next grocery receipt and I'll start remembering. Two receipts with the same items and I can already spot your first deals.";
  const lows = atTheirLow(stats);
  const battle = storeBattle(entries);
  const basket = smartBasket(stats, entries);
  const creeping = [...stats].filter(s => s.trendPct !== null && s.trendPct > 0).sort((a, b) => b.trendPct! - a.trendPct!)[0];
  const lines: string[] = [];
  lines.push(`You've logged ${receipts.length} receipt${receipts.length === 1 ? '' : 's'} and I'm tracking ${stats.length} items for you.`);
  if (lows.length > 0) lines.push(`Your biggest win: ${lows[0].displayName} is at ${money(lows[0].price)} at ${lows[0].store} — its all-time low, ${lows[0].vsAvgPct}% under your average. Stock-up territory.`);
  if (creeping) lines.push(`Watch out: ${creeping.displayName} has crept up ${Math.round(creeping.trendPct!)}% to ${money(creeping.lastPrice)} at ${creeping.lastStore}.`);
  if (basket.saveTotal > 0) lines.push(`Shopping every repeat item at its best-seen store would save you about ${money(basket.saveTotal)} a run versus your last-paid prices.`);
  if (battle.standings.length > 0) lines.push(`Store crown so far: ${battle.standings[0].store}, cheapest on ${battle.standings[0].wins} of your head-to-head items.`);
  lines.push('Snap your next receipt and I\'ll sharpen all of this further.');
  return lines.join(' ');
}

export function localAnalyst(stats: ItemStats[], entries: import('./store').PriceEntry[]): string {
  const battle = storeBattle(entries);
  const lows = atTheirLow(stats);
  const basket = smartBasket(stats, entries);
  const lines: string[] = [];
  if (battle.standings.length > 0) {
    lines.push(`Favor ${battle.standings[0].store} — it holds the cheapest price on ${battle.standings[0].wins} of your head-to-head items.`);
    const top = [...basket.lines].filter(l => l.save > 0)[0];
    if (top) lines.push(`Your clearest overpay: ${top.displayName} — you last paid ${money(top.lastPrice)} at ${top.lastStore}, but I've seen it at ${money(top.bestPrice)} at ${top.bestStore}.`);
  }
  if (lows.length > 0) lines.push(`Stock up on ${lows.slice(0, 3).map(l => l.displayName).join(', ')} — ${lows.length === 1 ? 'it is' : 'all'} at all-time-low prices right now.`);
  if (lines.length === 0) lines.push('I need the same item from two different stores before I can call real winners — one store per item is a sighting, two is a strategy.');
  lines.push('Every verdict here comes from your own receipts — the more you log, the sharper I get.');
  return lines.join(' ');
}


/* ---------- v1.8: Money Wellness AI ---------- */

import { priceHealth, monthPulse, MoodEntry } from './wellness';

export function buildWellnessContext(stats: ItemStats[], entries: import('./store').PriceEntry[], receipts: Receipt[], moods: MoodEntry[]): string {
  const h = priceHealth(stats, entries, receipts);
  const p = monthPulse(receipts);
  const parts = [
    buildDealsContext(stats, entries, receipts),
    `Price Health Score: ${h.score}/100 (${h.band}). Parts: buying below average ${h.parts.belowAvg}/40, tracking consistency ${h.parts.consistency}/25, store smarts ${h.parts.storeSmarts}/20, deal readiness ${h.parts.dealReady}/15.`,
    `Spending pulse: this month ${money(p.thisMonth)} across ${p.thisCount} receipts; last month ${money(p.lastMonth)} across ${p.lastCount}.`,
  ];
  if (moods.length > 0) {
    const counts = moods.reduce<Record<string, number>>((a, m) => { a[m.mood] = (a[m.mood] || 0) + 1; return a; }, {});
    parts.push('Shop mood check-ins so far: ' + Object.entries(counts).map(([k, v]) => `${k} ${v}x`).join(', ') + '.');
  }
  return parts.join('\n');
}

export const READING_QUESTION = 'Read my Price Health Score like a kind money coach: what is my strongest habit, what is quietly costing me, and what is the ONE focus that would raise my score most this week? Use only my facts in the context.';
export const missionQuestion = (intention: string) =>
  `My shopping intention today is: "${intention}". Turn it into one specific mission for my next shop using my actual items, stores and prices from the context — name the exact item(s) and target price(s) I should hunt. Two or three sentences, warm and direct.`;
export const reflectQuestion = (mood: string) =>
  `I just checked in: my last shop felt "${mood}". Reflect on that with me like a money-wellness coach — connect it to my actual price habits in the context if you can, and give me one gentle, practical thought for next time. Two or three sentences.`;
export const coachQuestion = (q: string) => q;
export const COACH_CHIPS = [
  'Am I overspending on anything?',
  'Where is my money quietly leaking?',
  'How could I save $20 on my next shop?',
];

export function localReading(stats: ItemStats[], entries: import('./store').PriceEntry[], receipts: Receipt[]): string {
  const h = priceHealth(stats, entries, receipts);
  const weakest = (Object.entries(h.parts) as [string, number][]).sort((a, b) => a[1] - b[1])[0][0];
  const tips: Record<string, string> = {
    belowAvg: 'Your weakest spot is buying above your own averages — before you grab a repeat item, check its page here and see what you usually pay.',
    consistency: 'Your tracking consistency is the gap — every receipt you snap makes me sharper. Five in a month maxes that part of your score.',
    storeSmarts: 'Store smarts is your growth edge: buy one repeat item at a second store and I can start crowning winners for you.',
    dealReady: 'Deal readiness grows when something you track hits its all-time low — keep logging and the lows will come to you.',
  };
  return `Your score is ${h.score}/100 — ${h.band.toLowerCase()}. ${localAnalyst(stats, entries)} ${tips[weakest]}`;
}

export function localReflection(mood: string): string {
  const lines: Record<string, string> = {
    calm: 'A calm shop is a sharp shop — unhurried eyes catch the prices that rushed ones miss. Whatever you did before this one, it worked. Let\'s make calm your default route.',
    rushed: 'Rushed shops are where averages get beaten in the bad way — no time to compare, no time to think. Next time, one slow lap past your usual items first; future-you keeps the difference.',
    stressed: 'I\'m sorry it felt like that. Money stress shrinks when the numbers are known — and yours are: I\'m holding every price so your brain doesn\'t have to. One receipt at a time, it gets lighter.',
    stocked: 'Stocked-up energy is the best kind — buying deep when prices are low is literally how the Deals Hub math pays you back. Proud of this one.',
  };
  return lines[mood] || lines.calm;
}

export function localMission(intention: string, stats: ItemStats[], entries: import('./store').PriceEntry[]): string {
  const lows = atTheirLow(stats);
  const basket = smartBasket(stats, entries);
  const topSave = basket.lines.filter(l => l.save > 0)[0];
  if (lows.length > 0) return `Your mission, should you choose it: stock up on ${lows[0].displayName} — it's at ${money(lows[0].price)} at ${lows[0].store}, its all-time low. That's "${intention}" with a receipt to prove it.`;
  if (topSave) return `Your mission: hunt ${topSave.displayName} at ${topSave.bestStore} — I've seen it at ${money(topSave.bestPrice)} there, versus the ${money(topSave.lastPrice)} you last paid. That single swap is "${intention}" in action.`;
  return `Your mission: log your next receipt the moment you get home, then check one repeat item's page before your following shop. Small, calm reps — that's how "${intention}" becomes a habit.`;
}
