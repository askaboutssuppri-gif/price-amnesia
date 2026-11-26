// delete-account — permanently deletes the caller's account:
// the Supabase auth login itself, plus their profile row and route history.
// The app cannot delete its own login from the client; only this server
// function (which holds the service-role key) can. Called from the app via
// supabase.functions.invoke("delete-account") — the caller's JWT arrives in
// the Authorization header and is verified before anything is deleted.
//
// DEPLOYED (project alldcvtfohwqtaalebxr, Verify JWT = ON) — probed live
// 2026-11-22: an unauthenticated call returns 401 UNAUTHORIZED_NO_AUTH_HEADER.
// This file is the source of record in the Price Amnesia repo; the function
// is SHARED with RouteMax Pro in this same project, so do not drop the
// route_history / profiles cleanup below — redeploying must keep it.
// Price Amnesia itself stores no per-user server rows (local-first), so for
// its users the auth-user delete is the whole job.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Not signed in." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Not signed in." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Delete the login first — if this fails, nothing else is touched.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;
    // Best-effort cleanup of the user's rows (orphaned rows are harmless if this fails).
    await admin.from("route_history").delete().eq("user_id", user.id);
    await admin.from("profiles").delete().eq("id", user.id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
