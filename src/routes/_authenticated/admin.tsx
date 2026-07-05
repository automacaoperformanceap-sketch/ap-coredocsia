import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageStub } from "@/components/page-stub";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "platform_admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <PageStub
      title="Admin da Plataforma"
      description="Gestão de tenants, preços de créditos, métricas globais e configurações de IA/OCR."
      icon={Shield}
      reference="4.2"
    />
  ),
});
