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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let deviceId = '';
  try { deviceId = (await req.json()).device_id ?? ''; } catch { return json({ error: 'Bad request' }, 400); }
  if (!deviceId) return json({ error: 'Missing device_id' }, 400);
  const { data: items, error } = await admin().from('pa_plaid_items')
    .select('item_id, access_token, institution_name').eq('device_id', deviceId);
  if (error) return json({ error: 'Could not load bank links' }, 500);
  const accounts: unknown[] = [];
  for (const item of items ?? []) {
    const res = await fetch(`${PLAID_BASE}/accounts/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plaidAuth(), access_token: item.access_token }),
    });
    const body = await res.json();
    if (!res.ok) continue; // one stale item shouldn't sink the rest
    for (const a of body.accounts ?? []) {
      accounts.push({
        item_id: item.item_id,
        institution: item.institution_name,
        account_id: a.account_id,
        name: a.official_name || a.name || 'Account',
        type: a.type, subtype: a.subtype,
        balance: a.balances?.current ?? null,
        available: a.balances?.available ?? null,
        last4: a.mask ?? null,
      });
    }
  }
  return json({ accounts });
});
