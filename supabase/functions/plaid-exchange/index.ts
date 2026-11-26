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
  let publicToken = '', deviceId = '', institutionName: string | null = null;
  try {
    const b = await req.json();
    publicToken = b.public_token ?? ''; deviceId = b.device_id ?? ''; institutionName = b.institution_name ?? null;
  } catch { return json({ error: 'Bad request' }, 400); }
  if (!publicToken || !deviceId) return json({ error: 'Missing token or device' }, 400);
  const res = await fetch(`${PLAID_BASE}/item/public_token/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...plaidAuth(), public_token: publicToken }),
  });
  const body = await res.json();
  if (!res.ok) return json({ error: body.error_message ?? 'Plaid error' }, 502);
  const { error: dbError } = await admin().from('pa_plaid_items').upsert(
    { device_id: deviceId, access_token: body.access_token, item_id: body.item_id, institution_name: institutionName },
    { onConflict: 'device_id,item_id' }
  );
  if (dbError) return json({ error: 'Could not save bank link' }, 500);
  return json({ ok: true, item_id: body.item_id, institution_name: institutionName });
});
