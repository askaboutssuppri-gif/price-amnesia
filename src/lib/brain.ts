// Echo's on-device brain. Answers real questions from the user's own
// price history — no network, no fake AI. When the cloud brain
// (echo-chat edge function) is switched on, open-ended questions go
// there instead; everything data-shaped is answered here first
// because only the device holds the full history.

import { ItemStats, Receipt, money, prettyDate, normalizeName } from './store';

function findItem(q: string, stats: ItemStats[]): ItemStats | null {
  const nq = normalizeName(q);
  if (!nq) return null;
  // exact-ish: every word of a known item appears in the question, or vice versa
  let best: ItemStats | null = null;
  for (const s of stats) {
    if (nq === s.normalized) return s;
    if (nq.includes(s.normalized) || s.normalized.includes(nq)) {
      if (!best || s.normalized.length > best.normalized.length) best = s;
    }
  }
  if (best) return best;
  // word overlap fallback
  const qWords = new Set(nq.split(' '));
  let bestScore = 0;
  for (const s of stats) {
    const score = s.normalized.split(' ').filter(w => qWords.has(w)).length;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore > 0 ? best : null;
}

function itemSummary(s: ItemStats): string {
  const trend = s.trendPct === null ? 'that was its first sighting' :
    s.trendPct <= -0.5 ? `down ${Math.abs(s.trendPct).toFixed(0)}% from the time before` :
    s.trendPct >= 0.5 ? `up ${s.trendPct.toFixed(0)}% from the time before` : 'holding steady';
  return `${cap(s.displayName)}: last paid ${money(s.lastPrice)} at ${s.lastStore} on ${prettyDate(s.lastDate)} — ${trend}. Your average is ${money(s.avg)}, lowest ever ${money(s.low)}, highest ${money(s.high)}. I've seen it ${s.count} time${s.count === 1 ? '' : 's'}.`;
}

function cap(t: string): string { return t.charAt(0).toUpperCase() + t.slice(1); }

export function answerQuestion(raw: string, stats: ItemStats[], receipts: Receipt[]): string {
  const q = raw.toLowerCase().trim();
  if (!q) return "Ask me anything about your prices — try “what did eggs cost?” or “what dropped?”";

  if (/^(hi|hey|hello|yo|sup)\b/.test(q)) {
    return stats.length === 0
      ? "Hey! I'm Echo. I don't know any of your prices yet — snap a receipt and I'll start remembering."
      : `Hey! I'm holding ${stats.length} items across ${receipts.length} receipts in my memory right now. Ask me what something cost, what dropped, or where to stock up.`;
  }
  if (/thank/.test(q)) return "Anytime. Forgetting prices is your job — remembering them is mine. 🧠";
  if (/who are you|your name/.test(q)) return "I'm Echo, the memory orb inside Price Amnesia. Prices go in, they never come out — unless you ask, and then I tell you everything.";

  if (/total|spent|spend/.test(q)) {
    const total = receipts.reduce((a, r) => a + r.total, 0);
    return receipts.length === 0 ? "No receipts yet, so $0.00 logged so far." :
      `Across your ${receipts.length} logged receipt${receipts.length === 1 ? '' : 's'}, you've spent ${money(total)} on the items I track.`;
  }
  if (/how many/.test(q)) {
    return `I'm tracking ${stats.length} different items from ${receipts.length} receipts.`;
  }
  if (/drop|cheaper|went down|deal|stock up|sale/.test(q)) {
    const drops = stats.filter(s => s.trendPct !== null && s.trendPct < -0.5).sort((a, b) => a.trendPct! - b.trendPct!).slice(0, 4);
    if (drops.length === 0) return "Nothing has dropped since its last sighting yet. The more receipts you feed me, the more drops I'll catch.";
    return "Here's what's cheaper than last time:\n" + drops.map(d => `• ${cap(d.displayName)} — ${money(d.lastPrice)} (▼ ${Math.abs(d.trendPct!).toFixed(0)}%, at ${d.lastStore})`).join('\n') + "\nIf you use any of these soon, that's your stock-up list.";
  }
  if (/up|rise|rising|expensive|increase|creep/.test(q) && !/stock up/.test(q)) {
    const rises = stats.filter(s => s.trendPct !== null && s.trendPct > 0.5).sort((a, b) => b.trendPct! - a.trendPct!).slice(0, 4);
    if (rises.length === 0) return "Nothing has jumped in price since its last sighting. Quiet shelf, happy wallet.";
    return "These crept up on you:\n" + rises.map(r => `• ${cap(r.displayName)} — ${money(r.lastPrice)} (▲ ${r.trendPct!.toFixed(0)}%, at ${r.lastStore})`).join('\n');
  }
  if (/most expensive|priciest|biggest price|highest price/.test(q)) {
    if (stats.length === 0) return "No prices in memory yet.";
    const top = [...stats].sort((a, b) => b.lastPrice - a.lastPrice)[0];
    return `Your priciest tracked item lately is ${top.displayName} at ${money(top.lastPrice)} (${top.lastStore}, ${prettyDate(top.lastDate)}).`;
  }
  if (/cheapest|lowest|best place|where.*cheap/.test(q)) {
    const item = findItem(q.replace(/cheapest|lowest|best place|where|to buy|buy/g, ''), stats);
    if (!item) return "Tell me which item — like “where is milk cheapest?” — and I'll compare every store you've bought it from.";
    const byStore = new Map<string, number[]>();
    for (const h of item.history) { const l = byStore.get(h.store) || []; l.push(h.price); byStore.set(h.store, l); }
    const rows = [...byStore.entries()].map(([store, ps]) => ({ store, avg: ps.reduce((a, b) => a + b, 0) / ps.length })).sort((a, b) => a.avg - b.avg);
    if (rows.length === 1) return `You've only bought ${item.displayName} at ${rows[0].store} so far (average ${money(rows[0].avg)}). Buy it somewhere else once and I'll be able to compare.`;
    return `For ${item.displayName}, ${rows[0].store} wins — average ${money(rows[0].avg)} vs ${money(rows[rows.length - 1].avg)} at ${rows[rows.length - 1].store}.`;
  }
  if (/save|saved|saving/.test(q)) {
    const under = stats.reduce((sum, s) => sum + Math.max(0, s.avg - s.lastPrice), 0);
    return under > 0
      ? `At your latest prices you're running ${money(under)} under your own averages across tracked items. Keep buying at the low points and that gap is real money.`
      : "Your latest prices are at or above your averages right now. Check the drops list before your next shop — that's where the savings hide.";
  }

  const item = findItem(q, stats);
  if (item) return itemSummary(item);

  if (/receipt/.test(q)) {
    if (receipts.length === 0) return "No receipts logged yet. Tap the big Snap button on Home to add your first.";
    const last = [...receipts].sort((a, b) => b.createdAt - a.createdAt)[0];
    return `Your most recent receipt is ${last.store} on ${prettyDate(last.date)} — ${last.itemCount} items, ${money(last.total)}. You've logged ${receipts.length} in total.`;
  }

  return stats.length === 0
    ? "I don't have any prices to work with yet — snap your first receipt and ask me again. Once I know your items, you can ask me things like “what did eggs cost?” or “what dropped?”"
    : "I couldn't match that to your price history. I answer best about your items — try “what did [item] cost?”, “what dropped?”, “where is [item] cheapest?”, or “how much have I spent?”";
}

/* ---------- generated insights + alerts ---------- */

export function buildInsights(stats: ItemStats[], receipts: Receipt[]): string[] {
  const out: string[] = [];
  const drops = stats.filter(s => s.trendPct !== null && s.trendPct <= -8).sort((a, b) => a.trendPct! - b.trendPct!);
  if (drops[0]) out.push(`📉 ${cap(drops[0].displayName)} is ${Math.abs(drops[0].trendPct!).toFixed(0)}% cheaper than last time at ${drops[0].lastStore}. That's the lowest kind of price to buy at.`);
  const rises = stats.filter(s => s.trendPct !== null && s.trendPct >= 12).sort((a, b) => b.trendPct! - a.trendPct!);
  if (rises[0]) out.push(`📈 ${cap(rises[0].displayName)} jumped ${rises[0].trendPct!.toFixed(0)}% to ${money(rises[0].lastPrice)}. If it's a staple, a different store might treat you better.`);
  const atLow = stats.filter(s => s.count >= 2 && s.lastPrice <= s.low * 1.02);
  if (atLow[0]) out.push(`🎯 ${cap(atLow[0].displayName)} is sitting at its lowest price you've ever seen (${money(atLow[0].lastPrice)}). Stock-up territory.`);
  const frequent = [...stats].sort((a, b) => b.count - a.count)[0];
  if (frequent && frequent.count >= 3) out.push(`🔁 ${cap(frequent.displayName)} is your most-tracked item — ${frequent.count} sightings, averaging ${money(frequent.avg)}. Your personal inflation index starts here.`);
  if (receipts.length >= 2) {
    const stores = new Set(receipts.map(r => r.store));
    out.push(`🧾 ${receipts.length} receipts across ${stores.size} store${stores.size === 1 ? '' : 's'} in my memory. Every new receipt makes my advice sharper.`);
  }
  return out.slice(0, 3);
}

export interface Alert { kind: 'stockup' | 'creep'; text: string }

export function buildAlerts(stats: ItemStats[], stockupThreshold = 0.10): Alert[] {
  const out: Alert[] = [];
  for (const s of stats) {
    if (s.count >= 2 && s.lastPrice <= s.avg * (1 - stockupThreshold)) {
      out.push({ kind: 'stockup', text: `${cap(s.displayName)} is ${Math.abs(s.vsAvgPct).toFixed(0)}% under your average at ${s.lastStore} — stock up while it's ${money(s.lastPrice)}.` });
    } else if (s.trendPct !== null && s.trendPct >= 15) {
      out.push({ kind: 'creep', text: `${cap(s.displayName)} crept up ${s.trendPct.toFixed(0)}% to ${money(s.lastPrice)} at ${s.lastStore}. Worth a price check elsewhere.` });
    }
  }
  return out.slice(0, 4);
}

export function itemCommentary(s: ItemStats): string {
  if (s.count === 1) return `First time I've seen ${s.displayName} — ${money(s.lastPrice)} at ${s.lastStore}. One more sighting and I can start spotting deals for you.`;
  if (s.lastPrice <= s.low * 1.02) return `This is as cheap as ${s.displayName} gets in your world — ${money(s.lastPrice)} matches your all-time low. If you use it, buy extra.`;
  if (s.trendPct !== null && s.trendPct <= -8) return `${cap(s.displayName)} just dropped ${Math.abs(s.trendPct).toFixed(0)}%. Whatever ${s.lastStore} is doing, it's working for you.`;
  if (s.trendPct !== null && s.trendPct >= 12) return `Heads up — ${s.displayName} jumped ${s.trendPct.toFixed(0)}% since last time. Your average is ${money(s.avg)}, so this price is on the rude side.`;
  if (s.vsAvgPct <= -5) return `Quietly a good buy — your last ${s.displayName} price was ${Math.abs(s.vsAvgPct).toFixed(0)}% under your average of ${money(s.avg)}.`;
  if (s.vsAvgPct >= 8) return `You paid ${s.vsAvgPct.toFixed(0)}% over your average for ${s.displayName} last time. Your cheapest was ${money(s.low)} — aim closer to that.`;
  return `${cap(s.displayName)} is behaving itself — last price ${money(s.lastPrice)}, average ${money(s.avg)}, seen ${s.count} times. Boring is good for a grocery budget.`;
}

export function checkTip(s: ItemStats, price: number): string {
  const cheaperCount = s.history.filter(h => h.price < price).length;
  if (s.history.length >= 2 && cheaperCount >= Math.ceil(s.history.length * 0.7)) {
    return `Echo's take: you've paid less than that in ${cheaperCount} of your ${s.history.length} sightings. History says patience pays here.`;
  }
  if (price <= s.avg) return `Echo's take: at or under your ${money(s.avg)} average — your future self approves.`;
  return `Echo's take: your lowest ever was ${money(s.low)}. If it's not urgent, this is a “wait for the dip” item.`;
}

export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Up late';
}

export const TAP_LINES = [
  "That's the spot. I remember everything — go ahead, test me.",
  "Boop received. My memory banks are glowing.",
  "Every price you've ever shown me is right here in my glow.",
  "Tap the Snap button and feed me a receipt — I get smarter every bite.",
  "Fun fact: I never forget a price. Politicians change. I don't.",
  "Ask me what eggs cost last month. Go on, I dare you.",
];
