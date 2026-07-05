import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const queryToken = url.searchParams.get("token");
        const authHeader = request.headers.get("authorization");
        const token = queryToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
        if (!token) return new Response("Unauthorized", { status: 401 });

        // Validate token via a publishable-key client (uses access token as user)
        const sbUrl = process.env.SUPABASE_URL!;
        const sbKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const authed = createClient(sbUrl, sbKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userRes, error: userErr } = await authed.auth.getUser();
        if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });

        // RLS-scoped read: the user token above is applied to this client, so
        // the document is only returned when backend access rules allow it.
        const { data: doc, error } = await authed
          .from("documents")
          .select("id, drive_file_id, mime_type, original_filename, org_id")
          .eq("id", params.id)
          .single();
        if (error || !doc || !doc.drive_file_id) {
          return new Response("Não encontrado", { status: 404 });
        }

        const { streamDriveFile } = await import("@/lib/drive.server");
        const driveRes = await streamDriveFile(doc.drive_file_id);
        if (!driveRes.ok || !driveRes.body) {
          return new Response(`Drive error: ${driveRes.status}`, { status: 502 });
        }
        const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
        return new Response(driveRes.body, {
          status: 200,
          headers: {
            "Content-Type": doc.mime_type || "application/octet-stream",
            "Content-Disposition": `${disposition}; filename="${doc.original_filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(doc.original_filename)}`,
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "SAMEORIGIN",
            "Content-Security-Policy": "default-src 'self'; object-src 'self'; frame-ancestors 'self';",
          },
        });
      },
    },
  },
});
