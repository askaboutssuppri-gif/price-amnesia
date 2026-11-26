// Price Amnesia — AI receipt extraction client.
// Calls the Supabase Edge Function 'extract-receipt' (Gemini vision) that
// lives in the user's price-amnesia Supabase project:
//   https://alldcvtfohwqtaalebxr.supabase.co
// The function went LIVE 2026-10-21 (verified end-to-end). Any failure
// returns { ok: false } after retries and the app falls back to fast
// manual item entry — the app never looks broken and never fakes an
// AI result.

import { getAccessToken } from './supabase';

export interface ExtractedItem {
  name: string;
  price: number;
  quantity: number | null;
  unit: string | null;
}

export interface ExtractResult {
  ok: boolean;
  store: string | null;
  date: string | null;
  items: ExtractedItem[];
  error?: string;
}

const FN_URL = 'https://alldcvtfohwqtaalebxr.supabase.co/functions/v1/extract-receipt';

export async function extractReceipt(imageDataUrl: string): Promise<ExtractResult> {
  // Up to 3 attempts: a single network blip or a momentary AI-service
  // hiccup must never dead-end the user (learned 2026-10-21 — a real
  // Grocery Outlet receipt failed once in-app while the same receipt
  // read perfectly server-side minutes later).
  let last: ExtractResult = { ok: false, store: null, date: null, items: [], error: 'AI not reachable' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500));
    last = await extractOnce(imageDataUrl);
    if (last.ok) return last;
  }
  return last;
}

async function extractOnce(imageDataUrl: string): Promise<ExtractResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    // Signed in? Send the user token so the function can see who is asking.
    // Signed out? The call goes without it, exactly as before (JWT is OFF).
    const token = await getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64: imageDataUrl }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, store: null, date: null, items: [], error: `AI service returned ${res.status}` };
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.items)) {
      return { ok: false, store: null, date: null, items: [], error: 'AI service sent an unreadable reply' };
    }
    const items: ExtractedItem[] = data.items
      .filter((it: any) => it && typeof it.name === 'string' && typeof it.price === 'number')
      .map((it: any) => ({
        name: String(it.name),
        price: Number(it.price),
        quantity: typeof it.quantity === 'number' ? it.quantity : null,
        unit: typeof it.unit === 'string' ? it.unit : null,
      }));
    return {
      ok: true,
      store: typeof data.store === 'string' ? data.store : null,
      date: typeof data.date === 'string' ? data.date : null,
      items,
    };
  } catch (e: any) {
    return { ok: false, store: null, date: null, items: [], error: e?.name === 'AbortError' ? 'AI timed out' : 'AI not reachable yet' };
  }
}

// Orb lines — Echo, the memory orb. First + second person, in character.
export function orbLine(stats: { items: number; receipts: number; topDrop?: { name: string; pct: number }; topRise?: { name: string; pct: number } }): string {
  if (stats.receipts === 0) return "I'm Echo — I never forget a price. Snap your first receipt and I'll start remembering for you.";
  if (stats.topDrop && stats.topDrop.pct <= -8) return `Good news — ${stats.topDrop.name} dropped ${Math.abs(Math.round(stats.topDrop.pct))}% since last time. I kept the receipts. Literally.`;
  if (stats.topRise && stats.topRise.pct >= 12) return `Heads up — ${stats.topRise.name} jumped ${Math.round(stats.topRise.pct)}% since last time. Might be worth shopping around.`;
  if (stats.items < 5) return `I'm tracking ${stats.items} item${stats.items === 1 ? '' : 's'} so far. The more receipts you feed me, the sharper my memory gets.`;
  return `I'm holding the price history on ${stats.items} items across ${stats.receipts} receipts. Ask me before you buy — I'll tell you if it's a good price.`;
}
