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
  let deviceId = '', itemId = '';
  try { const b = await req.json(); deviceId = b.device_id ?? ''; itemId = b.item_id ?? ''; }
  catch { return json({ error: 'Bad request' }, 400); }
  // item_id present -> update mode: hand back a Link token bound to that
  // item's access token so the user can repair a broken bank login.
  if (itemId) {
    const { data: row } = await admin().from('pa_plaid_items')
      .select('access_token').eq('device_id', deviceId).eq('item_id', itemId).maybeSingle();
    if (!row) return json({ error: 'Bank link not found' }, 404);
    const res = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...plaidAuth(), client_name: 'Price Amnesia', country_codes: ['US'], language: 'en', access_token: row.access_token }),
    });
    const body = await res.json();
    if (!res.ok) return json({ error: body.error_message ?? 'Plaid error' }, 502);
    return json({ link_token: body.link_token, mode: 'update' });
  }
  if (!deviceId) return json({ error: 'Missing device_id' }, 400);
  const res = await fetch(`${PLAID_BASE}/link/token/create`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...plaidAuth(),
      client_name: 'Price Amnesia',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      user: { client_user_id: deviceId },
    }),
  });
  const body = await res.json();
  if (!res.ok) return json({ error: body.error_message ?? 'Plaid error' }, 502);
  return json({ link_token: body.link_token, mode: 'link' });
});
