// Supabase Edge Function: plaid-transactions (Price Amnesia)
// Paste into: Supabase Dashboard -> Edge Functions -> New function
//   (name the function `plaid-transactions` — the name sets the URL slug;
//    it must end /plaid-transactions or the app gets a 404)
// Verify JWT: OFF (new functions are born ON — the app calls this with no
//   auth header, exactly like plaid-accounts, so ON means 401)
// Secrets needed: NONE new — reuses PLAID_CLIENT_ID, PLAID_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set for plaid-accounts).
//
// Returns the last 30 days of card purchases for every bank linked to this
// phone (device_id). The app merges them with scanned receipts — a purchase
// that matches a receipt is the same money, counted once. Receipts stay the
// source for per-item prices: Plaid only knows the store total.
// Re-link fallback: if Plaid says an item has no transactions product
// (linked before purchase history was requested), this answers 502 with
// error NEEDS_RELINK and the app tells the user to re-link that bank.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAID_ENV = Deno.env.get('PLAID_ENV') ?? 'sandbox';
const PLAID_BASE =
  PLAID_ENV === 'production'
    ? 'https://production.plaid.com'
    : PLAID_ENV === 'development'
      ? 'https://development.plaid.com'
      : 'https://sandbox.plaid.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// Service-role client: Price Amnesia has no user accounts; the app identifies
// itself with a private per-device ID and ONLY these functions (service role)
// can touch pa_plaid_items. Access tokens never ship in the app.
const admin = () => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const plaidAuth = () => ({ client_id: Deno.env.get('PLAID_CLIENT_ID'), secret: Deno.env.get('PLAID_SECRET') });

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let deviceId = '';
  try { deviceId = (await req.json()).device_id ?? ''; } catch { return json({ error: 'Bad request' }, 400); }
  if (!deviceId) return json({ error: 'Missing device_id' }, 400);
  const { data: items, error } = await admin().from('pa_plaid_items')
    .select('item_id, access_token, institution_name').eq('device_id', deviceId);
  if (error) return json({ error: 'Could not load bank links' }, 500);

  const endDate = isoDay(new Date());
  const startDate = isoDay(new Date(Date.now() - 30 * 864e5));
  const transactions: unknown[] = [];
  let productNotReady = false;
  for (const item of items ?? []) {
    // Paginate: Plaid caps one call at 250; 4 pages covers 1000 buys.
    let offset = 0;
    let total = Infinity;
    let pages = 0;
    while (offset < total && pages < 4) {
      pages++;
      const res = await fetch(`${PLAID_BASE}/transactions/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...plaidAuth(), access_token: item.access_token,
          start_date: startDate, end_date: endDate,
          options: { count: 250, offset },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const code = String(body?.error_code ?? '');
        // A brand-new link needs time before Plaid has history to return.
        if (code.includes('NOT_READY')) { productNotReady = true; break; }
        // Item was linked before purchase history was requested.
        if (code === 'INVALID_PRODUCT' || code === 'PRODUCT_NOT_ENABLED' || code === 'ITEM_PRODUCT_NOT_ENABLED') {
          return json({ error: 'NEEDS_RELINK', message: 'This bank link was made before purchase history was turned on — re-link the bank to enable it.' }, 502);
        }
        break; // one stale item shouldn't sink the rest
      }
      total = typeof body.total_transactions === 'number' ? body.total_transactions : (body.transactions ?? []).length;
      const page = body.transactions ?? [];
      for (const t of page) {
        transactions.push({
          transaction_id: t.transaction_id,
          account_id: t.account_id,
          item_id: item.item_id,
          institution: item.institution_name,
          name: t.name ?? '',
          merchant_name: t.merchant_name ?? null,
          amount: typeof t.amount === 'number' ? t.amount : 0,
          date: t.date ?? endDate,
          pending: t.pending === true,
          category: Array.isArray(t.category) ? t.category : [],
          pfc_primary: t.personal_finance_category?.primary ?? null,
          pfc_detailed: t.personal_finance_category?.detailed ?? null,
          payment_channel: t.payment_channel ?? null,
        });
      }
      if (!page.length) break;
      offset += page.length;
    }
  }
  return json({ transactions, product_not_ready: productNotReady });
});
