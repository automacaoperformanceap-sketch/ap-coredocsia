import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { supabase } from "./integrations/supabase/client";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";

const AUTH_REFRESH_WINDOW_SECONDS = 5 * 60;

const refreshSupabaseAuthBeforeFunction = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const expiresAt = session?.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);

    if (session && expiresAt - now < AUTH_REFRESH_WINDOW_SECONDS) {
      await supabase.auth.refreshSession();
    }

    return next();
  },
);

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [refreshSupabaseAuthBeforeFunction, attachSupabaseAuth],
}));
