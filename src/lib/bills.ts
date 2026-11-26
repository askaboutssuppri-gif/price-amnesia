/* Bill Lens — read + interpret any bill. Bills are stored on-device;
   the reading runs through the analyze-bill edge function (Gemini),
   deployed in the same Supabase project as the receipt reader. */

import { getAccessToken } from './supabase';

export type BillType = 'electric' | 'gas' | 'water' | 'internet' | 'phone' | 'medical' | 'insurance' | 'rent' | 'credit-card' | 'loan' | 'subscription' | 'other';

export interface BillLine { label: string; amount: number }
export interface BillRecord {
  id: string;
  biller: string;
  type: BillType;
  amountDue: number | null;
  dueDate: string | null;      // YYYY-MM-DD
  periodStart: string | null;
  periodEnd: string | null;
  accountLast4: string | null;
  usage: string | null;
  lineItems: BillLine[];
  summary: string;
  watchFor: string[];
  photo: string | null;
  createdAt: number;
}

const BILLS_KEY = 'priceamnesia:bills';
const FN_URL = 'https://alldcvtfohwqtaalebxr.supabase.co/functions/v1/analyze-bill';

export const BILL_ICONS: Record<BillType, string> = {
  electric: '⚡', gas: '🔥', water: '💧', internet: '🌐', phone: '📱',
  medical: '🏥', insurance: '🛡️', rent: '🏠', 'credit-card': '💳', loan: '🏦', subscription: '🔁', other: '📄',
};

export function loadBills(): BillRecord[] {
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function saveBills(bills: BillRecord[]) {
  try { localStorage.setItem(BILLS_KEY, JSON.stringify(bills)); } catch { /* full/blocked */ }
}

export interface AnalyzeResult {
  ok: boolean;
  status?: number;
  bill?: Omit<BillRecord, 'id' | 'photo' | 'createdAt'>;
  error?: string;
}

export async function analyzeBill(imageDataUrl: string): Promise<AnalyzeResult> {
  let last: AnalyzeResult = { ok: false, error: 'Bill reader not reachable' };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500));
    last = await analyzeOnce(imageDataUrl);
    if (last.ok) return last;
    if (last.status === 404) return last; // function not deployed yet — retrying won't help
  }
  return last;
}

async function analyzeOnce(imageDataUrl: string): Promise<AnalyzeResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
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
    if (!res.ok) return { ok: false, status: res.status, error: `Bill reader returned ${res.status}` };
    const data = await res.json();
    if (!data || typeof data !== 'object') return { ok: false, error: 'Bill reader sent an unreadable reply' };
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    const types: BillType[] = ['electric', 'gas', 'water', 'internet', 'phone', 'medical', 'insurance', 'rent', 'credit-card', 'loan', 'subscription', 'other'];
    return {
      ok: true,
      bill: {
        biller: str(data.biller) || 'Unknown biller',
        type: types.includes(data.type) ? data.type : 'other',
        amountDue: num(data.amountDue),
        dueDate: str(data.dueDate),
        periodStart: str(data.periodStart),
        periodEnd: str(data.periodEnd),
        accountLast4: str(data.accountLast4),
        usage: str(data.usage),
        lineItems: Array.isArray(data.lineItems)
          ? data.lineItems.filter((l: BillLine) => l && typeof l.label === 'string' && typeof l.amount === 'number')
          : [],
        summary: str(data.summary) || '',
        watchFor: Array.isArray(data.watchFor) ? data.watchFor.filter((w: unknown) => typeof w === 'string') : [],
      },
    };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err?.name === 'AbortError' ? 'Bill reader timed out' : 'Bill reader not reachable' };
  }
}

/** Whole days from today until the due date (negative = overdue). */
export function daysUntil(dateStr: string, now = new Date()): number {
  const due = new Date(dateStr + 'T12:00:00').getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime();
  return Math.round((due - today) / 864e5);
}

export function dueLabel(dateStr: string, now = new Date()): string {
  const d = daysUntil(dateStr, now);
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due in ${d} days`;
}

/** % change of this bill vs the previous bill from the same biller. */
export function changeVsPrev(bill: BillRecord, all: BillRecord[]): number | null {
  if (bill.amountDue === null) return null;
  const prev = all
    .filter(b => b.biller === bill.biller && b.id !== bill.id && b.amountDue !== null && b.createdAt < bill.createdAt)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!prev || !prev.amountDue) return null;
  return Math.round((bill.amountDue - prev.amountDue) / prev.amountDue * 100);
}
