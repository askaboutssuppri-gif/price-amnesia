import { ItemStats, Receipt, PriceEntry, money } from './store';
import { atTheirLow } from './deals';

/* Money Wellness engine — every number is computed from the user's own
   logged receipts. The AI surfaces narrate these facts; they never
   invent new ones. */

export interface HealthParts { belowAvg: number; consistency: number; storeSmarts: number; dealReady: number }
export interface Health { score: number; parts: HealthParts; band: string }

export function priceHealth(stats: ItemStats[], entries: PriceEntry[], receipts: Receipt[], now = Date.now()): Health {
  const repeats = stats.filter(s => s.count >= 2);
  // Buying below your own average (40 pts)
  const belowAvg = repeats.length === 0 ? 0
    : Math.round(repeats.filter(s => s.lastPrice <= s.avg).length / repeats.length * 40);
  // Tracking consistency — receipts in the last 30 days (25 pts, full at 5)
  const recent = receipts.filter(r => now - new Date(r.date + 'T12:00:00').getTime() < 30 * 864e5).length;
  const consistency = Math.min(25, recent * 5);
  // Store smarts — repeat items seen at 2+ stores (20 pts)
  let storeSmarts = 0;
  if (repeats.length > 0) {
    const storesByItem = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!storesByItem.has(e.normalized)) storesByItem.set(e.normalized, new Set());
      storesByItem.get(e.normalized)!.add(e.store);
    }
    const multi = repeats.filter(s => (storesByItem.get(s.normalized)?.size || 0) >= 2).length;
    storeSmarts = Math.round(multi / repeats.length * 20);
  }
  // Deal readiness — repeat items currently at their low (15 pts)
  const lows = atTheirLow(stats).length;
  const dealReady = repeats.length === 0 ? 0 : Math.round(Math.min(1, lows / Math.max(1, repeats.length / 2)) * 15);
  const score = belowAvg + consistency + storeSmarts + dealReady;
  const band = score >= 80 ? 'Thriving' : score >= 60 ? 'Strong' : score >= 40 ? 'Warming up' : 'Just sprouting';
  return { score, parts: { belowAvg, consistency, storeSmarts, dealReady }, band };
}

export function monthPulse(receipts: Receipt[], now = new Date()): { thisMonth: number; lastMonth: number; thisCount: number; lastCount: number } {
  const ym = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const cur = ym(now);
  let thisMonth = 0, lastMonth = 0, thisCount = 0, lastCount = 0;
  for (const r of receipts) {
    const m = ym(new Date(r.date + 'T12:00:00'));
    if (m === cur) { thisMonth += r.total; thisCount++; }
    else if (m === cur - 1) { lastMonth += r.total; lastCount++; }
  }
  return { thisMonth, lastMonth, thisCount, lastCount };
}

export interface Win { icon: string; text: string; when: string }
export function winsWall(stats: ItemStats[]): Win[] {
  const wins: Win[] = [];
  for (const l of atTheirLow(stats)) {
    wins.push({ icon: '🎯', text: `${cap(l.displayName)} is at its all-time low — ${money(l.price)} at ${l.store}`, when: 'now' });
  }
  const drops = [...stats].filter(s => s.trendPct !== null && s.trendPct <= -10)
    .sort((a, b) => a.trendPct! - b.trendPct!).slice(0, 3);
  for (const d of drops) {
    wins.push({ icon: '📉', text: `You caught ${cap(d.displayName)} down ${Math.abs(Math.round(d.trendPct!))}% — now ${money(d.lastPrice)}`, when: d.lastDate });
  }
  const under = [...stats].filter(s => s.count >= 2 && s.vsAvgPct <= -12)
    .sort((a, b) => a.vsAvgPct - b.vsAvgPct).slice(0, 2);
  for (const u of under) {
    if (!wins.some(w => w.text.includes(cap(u.displayName)))) {
      wins.push({ icon: '💰', text: `${cap(u.displayName)} last bought ${Math.abs(Math.round(u.vsAvgPct))}% under your average`, when: u.lastDate });
    }
  }
  return wins.slice(0, 5);
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ---------- mood check-ins + daily intention (stored on-device) ---------- */
export type Mood = 'calm' | 'rushed' | 'stressed' | 'stocked';
export interface MoodEntry { at: number; mood: Mood }
const MOOD_KEY = 'priceamnesia:moods';
export function loadMoods(): MoodEntry[] {
  try { const a = JSON.parse(localStorage.getItem(MOOD_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function addMood(mood: Mood): MoodEntry[] {
  const next = [...loadMoods(), { at: Date.now(), mood }].slice(-60);
  try { localStorage.setItem(MOOD_KEY, JSON.stringify(next)); } catch { /* full */ }
  return next;
}
const INTENT_KEY = 'priceamnesia:intention';
export function loadIntention(): { day: string; text: string; mission?: string } | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.day === new Date().toDateString() ? v : null;
  } catch { return null; }
}
export function saveIntention(text: string, mission?: string) {
  try { localStorage.setItem(INTENT_KEY, JSON.stringify({ day: new Date().toDateString(), text, mission })); } catch { /* full */ }
}
