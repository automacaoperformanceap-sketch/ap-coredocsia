import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SYSTEM_VARS = new Set([
  "PATH", "HOME", "DENO_DIR", "HOSTNAME", "PORT", "TMPDIR", "USER", "LANG",
  "TERM", "_", "DENO_REGION", "DENO_DEPLOYMENT_ID",
]);

const knownFunctionNames = ["migrate-sql", "painel-migracao"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  const env = Deno.env.toObject();
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (SYSTEM_VARS.has(k)) continue;
    if (k.startsWith("XDG_")) continue;
    filtered[k] = v;
  }

  const SUPABASE_URL = env.SUPABASE_URL ?? "";
  const project_url = SUPABASE_URL;
  const anon_key = env.SUPABASE_ANON_KEY ?? env.SUPABASE_PUBLISHABLE_KEY ?? "";
  const service_role_key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  // Probe edge functions
  const probes = await Promise.allSettled(
    knownFunctionNames.map((name) =>
      fetch(`${SUPABASE_URL}/functions/v1/${name}`, { method: "OPTIONS" }).then((r) => ({
        name,
        status: r.status,
      })),
    ),
  );
  const edge_functions: string[] = [];
  for (const p of probes) {
    if (p.status === "fulfilled" && p.value.status < 500) edge_functions.push(p.value.name);
  }

  // Discover tables
  let database_tables: unknown = [];
  if (service_role_key) {
    try {
      const sb = createClient(SUPABASE_URL, service_role_key);
      const sql = `
        SELECT
          t.tablename,
          COALESCE((SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relname = t.tablename AND s.schemaname = 'public'), 0) AS row_count,
          (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.tablename) AS column_count,
          0 AS encrypted_columns,
          EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.tablename AND c.column_name = 'user_id') AS has_user_id
        FROM pg_tables t
        WHERE t.schemaname = 'public'
        ORDER BY t.tablename
      `;
      const { data, error } = await sb.rpc("exec_sql", { sql_query: sql });
      if (!error) database_tables = data ?? [];
    } catch (_) {
      // ignore
    }
  }

  const payload = {
    project_url,
    anon_key,
    service_role_key,
    secrets: filtered,
    edge_functions,
    edge_functions_count: edge_functions.length,
    database_tables,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
