import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign-in required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  let body: { guild_id?: string; message?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.guild_id || typeof body.message !== "string" || body.message.length > 1800) {
    return json({ error: "guild_id and a message of up to 1800 characters are required" }, 400);
  }

  const admin = createClient(url, serviceKey);
  const { data: membership } = await admin.from("guild_memberships")
    .select("role").eq("guild_id", body.guild_id).eq("user_id", userData.user.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return json({ error: "Only guild owners/admins can send Discord announcements" }, 403);
  }

  const { data: integration, error: integrationError } = await admin.from("guild_integrations")
    .select("discord_webhook_url").eq("guild_id", body.guild_id).maybeSingle();
  if (integrationError || !integration?.discord_webhook_url) return json({ error: "No Discord webhook configured for this guild" }, 404);

  const webhook = integration.discord_webhook_url;
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhook)) {
    return json({ error: "Webhook URL must be a Discord webhook URL" }, 400);
  }
  const discordResponse = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: body.message, allowed_mentions: { parse: [] } }),
  });
  if (!discordResponse.ok) return json({ error: `Discord returned status ${discordResponse.status}` }, 502);
  return json({ ok: true });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
