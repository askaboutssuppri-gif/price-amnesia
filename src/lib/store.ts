// Price Amnesia — local-first store.
// Everything lives on-device in localStorage first, so the app can never
// die on a network error the way the old Expo build did. Supabase sync
// is a later layer; the core loop works fully offline.

export interface PriceEntry {
  id: string;
  receiptId: string;
  name: string;        // display name as entered / extracted
  normalized: string;  // matching key
  price: number;       // total price paid for the line
  quantity: number | null;
  unit: string | null;
  store: string;
  date: string;        // YYYY-MM-DD
  createdAt: number;
}

export interface Receipt {
  id: string;
  store: string;
  category?: string;   // receipt category id (RECEIPT_CATS) — v1.14 universal receipts
  date: string;        // YYYY-MM-DD
  photo: string | null; // compressed data-url thumbnail, or null
  source: 'scan' | 'manual';
  total: number;
  itemCount: number;
  createdAt: number;
}

export interface ItemStats {
  normalized: string;
  displayName: string;
  count: number;
  lastPrice: number;
  lastDate: string;
  lastStore: string;
  prevPrice: number | null;
  avg: number;
  low: number;
  high: number;
  trendPct: number | null; // last vs previous, %
  vsAvgPct: number;        // last vs avg, %
  history: PriceEntry[];   // oldest -> newest
}

const R_KEY = 'priceamnesia:v1:receipts';
const E_KEY = 'priceamnesia:v1:entries';
const PLUS_KEY = 'priceamnesia:plus';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function normalizeName(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // strip common size/count suffixes so "eggs 12ct" matches "eggs"
  s = s.replace(/\b(\d+(\.\d+)?\s*(ct|oz|lb|lbs|g|kg|ml|l|ea|pack|pk|count))\b/g, '').replace(/\s+/g, ' ').trim();
  // naive singular: trailing s on last word
  const words = s.split(' ');
  const last = words[words.length - 1];
  if (last && last.length > 3 && last.endsWith('s') && !last.endsWith('ss')) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(' ');
}

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(R_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function loadEntries(): PriceEntry[] {
  try {
    const raw = localStorage.getItem(E_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveAll(receipts: Receipt[], entries: PriceEntry[]) {
  try {
    localStorage.setItem(R_KEY, JSON.stringify(receipts));
    localStorage.setItem(E_KEY, JSON.stringify(entries));
  } catch {
    // storage full (photo too big) — retry without photos
    try {
      localStorage.setItem(R_KEY, JSON.stringify(receipts.map(r => ({ ...r, photo: null }))));
      localStorage.setItem(E_KEY, JSON.stringify(entries));
    } catch { /* give up silently; entries for this session still live in state */ }
  }
}

export function isPlusLocal(): boolean {
  try { return localStorage.getItem(PLUS_KEY) === '1'; } catch { return false; }
}
export function setPlusLocal(v: boolean) {
  try { localStorage.setItem(PLUS_KEY, v ? '1' : '0'); } catch { /* noop */ }
}

export function itemStats(entries: PriceEntry[]): ItemStats[] {
  const byKey = new Map<string, PriceEntry[]>();
  for (const e of entries) {
    const list = byKey.get(e.normalized) || [];
    list.push(e);
    byKey.set(e.normalized, list);
  }
  const out: ItemStats[] = [];
  for (const [normalized, list] of byKey) {
    const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
    const prices = sorted.map(e => e.price);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    out.push({
      normalized,
      displayName: last.name,
      count: sorted.length,
      lastPrice: last.price,
      lastDate: last.date,
      lastStore: last.store,
      prevPrice: prev ? prev.price : null,
      avg,
      low: Math.min(...prices),
      high: Math.max(...prices),
      trendPct: prev && prev.price > 0 ? ((last.price - prev.price) / prev.price) * 100 : null,
      vsAvgPct: avg > 0 ? ((last.price - avg) / avg) * 100 : 0,
      history: sorted,
    });
  }
  // most recently seen first
  out.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
  return out;
}

export function money(n: number): string {
  return '$' + n.toFixed(2);
}

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function prettyDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// Compress a picked photo to a small jpeg data-url so localStorage survives.
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/* ---------- preferences (Settings) ---------- */
export type ThemeName = 'aurora' | 'gentle' | 'day';
export interface Prefs { homeStore: string; alertPct: number; echoCards: boolean; theme: ThemeName }
export const DEFAULT_PREFS: Prefs = { homeStore: '', alertPct: 0.10, echoCards: true, theme: 'aurora' };
const PREFS_KEY = 'priceamnesia:prefs';
export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { /* fresh */ }
  return { ...DEFAULT_PREFS };
}
export function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* full/blocked */ }
}

/* ---------- erase snapshot (Recover) ---------- */
const TRASH_KEY = 'priceamnesia:trash';
export interface TrashSnapshot { receipts: Receipt[]; entries: PriceEntry[]; at: number }
export function saveTrash(receipts: Receipt[], entries: PriceEntry[]) {
  try { localStorage.setItem(TRASH_KEY, JSON.stringify({ receipts, entries, at: Date.now() })); } catch { /* full/blocked */ }
}
export function loadTrash(): TrashSnapshot | null {
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TrashSnapshot;
    return Array.isArray(t.receipts) && Array.isArray(t.entries) ? t : null;
  } catch { return null; }
}
export function clearTrash() { try { localStorage.removeItem(TRASH_KEY); } catch { /* noop */ } }

/* ---------- backup / restore ---------- */
export function backupJSON(receipts: Receipt[], entries: PriceEntry[]): string {
  return JSON.stringify({ app: 'price-amnesia', version: 1, exportedAt: new Date().toISOString(), receipts, entries }, null, 2);
}
export function parseBackup(text: string): { receipts: Receipt[]; entries: PriceEntry[] } | null {
  try {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.receipts) || !Array.isArray(data.entries)) return null;
    const okE = data.entries.every((e: PriceEntry) => e && typeof e.name === 'string' && typeof e.price === 'number' && typeof e.store === 'string' && typeof e.date === 'string');
    const okR = data.receipts.every((r: Receipt) => r && typeof r.store === 'string' && typeof r.total === 'number');
    return okE && okR ? { receipts: data.receipts, entries: data.entries } : null;
  } catch { return null; }
}

export function storageKB(): number {
  try {
    let n = 0;
    for (const k of [R_KEY, E_KEY, PLUS_KEY, PREFS_KEY, TRASH_KEY]) {
      const v = localStorage.getItem(k);
      if (v) n += v.length;
    }
    return Math.round(n / 1024 * 10) / 10;
  } catch { return 0; }
}

/* ---- v1.14: universal receipt categories ----
   The app tracks ALL receipts, not just groceries. The category is
   auto-guessed from the business name and always editable at scan
   time. It drives budget mapping and receipt filtering. */
export interface ReceiptCat { id: string; icon: string; label: string }
export const RECEIPT_CATS: ReceiptCat[] = [
  { id: 'groceries', icon: '🛒', label: 'Groceries' },
  { id: 'dining', icon: '🍔', label: 'Dining' },
  { id: 'gas', icon: '⛽', label: 'Gas & auto' },
  { id: 'shopping', icon: '🛍️', label: 'Shopping' },
  { id: 'pharmacy', icon: '💊', label: 'Pharmacy & health' },
  { id: 'hardware', icon: '🔨', label: 'Home & hardware' },
  { id: 'services', icon: '🧾', label: 'Services' },
  { id: 'other', icon: '📦', label: 'Other' },
];
const CAT_KEYWORDS: [string, string[]][] = [
  ['gas', ['shell', 'chevron', 'arco', '76 ', 'texaco', 'bp ', 'exxon', 'mobil', 'gas', 'fuel', 'auto zone', 'autozone', "o'reilly", 'jiffy', 'tire']],
  ['dining', ['mcdonald', 'burger', 'pizza', 'starbucks', 'coffee', 'taco', 'wendy', 'subway', 'chipotle', 'restaurant', 'grill', 'kitchen', 'diner', 'cafe', 'bakery', 'noodle', 'sushi', 'bbq', 'deli']],
  ['pharmacy', ['cvs', 'walgreens', 'rite aid', 'pharmacy', 'drug']],
  ['hardware', ['home depot', 'lowe', 'ace hardware', 'hardware', 'menards', 'tractor supply']],
  ['groceries', ['walmart', 'target', 'costco', 'safeway', 'kroger', 'grocery', 'market', 'food', 'aldi', 'winco', 'trader joe', 'sprouts', 'whole foods', 'publix', 'albertsons', 'vons', 'ralphs', 'outlet', 'dollar general', 'dollar tree', '99 cent']],
  ['shopping', ['amazon', 'best buy', 'tj maxx', 'marshalls', 'ross', 'nike', 'clothing', 'shoe', 'macy', 'kohl', 'old navy', 'gap']],
  ['services', ['salon', 'barber', 'laundry', 'cleaners', 'repair', 'studio', 'fitness', 'gym']],
];
export function detectCategory(store: string): string {
  const s = ' ' + (store || '').toLowerCase() + ' ';
  for (const [cat, words] of CAT_KEYWORDS) {
    if (words.some(w => s.includes(w))) return cat;
  }
  return 'other';
}
export function receiptCatOf(r: Receipt): string {
  return r.category && RECEIPT_CATS.some(c => c.id === r.category) ? r.category : detectCategory(r.store);
}
export function catMeta(id: string): ReceiptCat {
  return RECEIPT_CATS.find(c => c.id === id) || RECEIPT_CATS[RECEIPT_CATS.length - 1];
}
/** Which budget category a receipt feeds. */
export function budgetCatOf(r: Receipt): string {
  const c = receiptCatOf(r);
  return c === 'groceries' || c === 'dining' || c === 'gas' || c === 'shopping' ? c : 'other';
}
