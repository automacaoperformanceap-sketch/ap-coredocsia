import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useProfileBundle } from "@/hooks/use-profile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings,
  User,
  Building,
  Users,
  Shield,
  Bell,
  HardDrive,
  Loader2,
  Trash2,
  Plus,
  Sparkles,

} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profileBundle, loading: profileLoading } = useProfileBundle();
  const [activeTab, setActiveTab] = useState("profile");

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = profileBundle?.roles.includes("org_admin") || profileBundle?.isPlatformAdmin;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Settings className="h-3.5 w-3.5 text-blue-800" />
            Painel de configurações
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Gerencie sua conta, organização e preferências do sistema.
          </p>
        </div>
      </header>


      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl border border-border bg-gradient-to-br from-slate-900/5 via-blue-900/5 to-sky-700/5 p-1.5">
          <TabsTrigger
            value="profile"
            className="gap-2 rounded-xl px-3 py-1.5 text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-800 data-[state=active]:via-blue-800 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <User className="h-4 w-4" /> Perfil
          </TabsTrigger>
          <TabsTrigger
            value="organization"
            className="gap-2 rounded-xl px-3 py-1.5 text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-800 data-[state=active]:via-blue-800 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <Building className="h-4 w-4" /> Organização
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="members"
              className="gap-2 rounded-xl px-3 py-1.5 text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-800 data-[state=active]:via-blue-800 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <Users className="h-4 w-4" /> Membros
            </TabsTrigger>
          )}
          <TabsTrigger
            value="notifications"
            className="gap-2 rounded-xl px-3 py-1.5 text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-800 data-[state=active]:via-blue-800 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <Bell className="h-4 w-4" /> Notificações
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="billing"
              className="gap-2 rounded-xl px-3 py-1.5 text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-slate-800 data-[state=active]:via-blue-800 data-[state=active]:to-sky-700 data-[state=active]:text-white data-[state=active]:shadow-md"
            >
              <Sparkles className="h-4 w-4" /> Faturamento IA
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileSettings profile={profileBundle?.profile} />
        </TabsContent>

        <TabsContent value="organization" className="space-y-6">
          <OrganizationSettings 
            organization={profileBundle?.currentOrg} 
            isAdmin={!!isAdmin} 
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="members" className="space-y-6">
            <MembersSettings organizationId={profileBundle?.currentOrg?.id} />
          </TabsContent>
        )}

        <TabsContent value="notifications" className="space-y-6">
          <NotificationSettings />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="billing" className="space-y-6">
            <AiModelsSettings organizationId={profileBundle?.currentOrg?.id} />
            <BillingSettings organizationId={profileBundle?.currentOrg?.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const GEMINI_MODELS = [
  
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — equilíbrio (recomendado)" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — mais barato/rápido" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite — novo" },
];

const CLAUDE_MODELS = [
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 — máxima qualidade" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 — equilíbrio" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — rápido (recomendado)" },
];

function AiModelsSettings({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-ai-models", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("ai_gemini_model, ai_claude_model")
        .eq("id", organizationId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [geminiModel, setGeminiModel] = useState<string>("gemini-2.5-flash");
  const [claudeModel, setClaudeModel] = useState<string>("claude-haiku-4-5-20251001");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.ai_gemini_model) setGeminiModel(data.ai_gemini_model);
    if (data.ai_claude_model) setClaudeModel(data.ai_claude_model);
  }, [data]);

  async function handleSave() {
    if (!organizationId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ ai_gemini_model: geminiModel, ai_claude_model: claudeModel })
        .eq("id", organizationId);
      if (error) throw error;
      toast.success("Modelos de IA atualizados!");
      queryClient.invalidateQueries({ queryKey: ["org-ai-models", organizationId] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelos de IA</CardTitle>
        <CardDescription>
          Escolha o modelo usado em cada motor de extração. Aplica-se aos próximos processamentos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Motor Gemini</Label>
                <Select value={geminiModel} onValueChange={setGeminiModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GEMINI_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Modelo atual: <code>{geminiModel}</code></p>
              </div>
              <div className="space-y-2">
                <Label>Motor Claude</Label>
                <Select value={claudeModel} onValueChange={setClaudeModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLAUDE_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Modelo atual: <code>{claudeModel}</code></p>
              </div>
            </div>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar modelos
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BillingSettings({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-billing", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("ai_cost_per_file, ai_price_base_threshold, ai_price_tier_step, ai_price_tier_increment")
        .eq("id", organizationId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [price, setPrice] = useState<string>("");
  const [baseThreshold, setBaseThreshold] = useState<string>("");
  const [tierStep, setTierStep] = useState<string>("");
  const [tierIncrement, setTierIncrement] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.ai_cost_per_file != null) setPrice(String(data.ai_cost_per_file));
    if (data.ai_price_base_threshold != null) setBaseThreshold(String(data.ai_price_base_threshold));
    if (data.ai_price_tier_step != null) setTierStep(String(data.ai_price_tier_step));
    if (data.ai_price_tier_increment != null) setTierIncrement(String(data.ai_price_tier_increment));
  }, [data]);

  async function handleSave() {
    const parsedPrice = Number(String(price).replace(",", "."));
    const parsedThreshold = Math.floor(Number(String(baseThreshold).replace(",", ".")));
    const parsedStep = Math.floor(Number(String(tierStep).replace(",", ".")));
    const parsedIncrement = Number(String(tierIncrement).replace(",", "."));

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Informe um preço base válido (R$).");
      return;
    }
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      toast.error("Informe um limite de tokens válido.");
      return;
    }
    if (!Number.isFinite(parsedStep) || parsedStep <= 0) {
      toast.error("O tamanho do bloco deve ser maior que zero.");
      return;
    }
    if (!Number.isFinite(parsedIncrement) || parsedIncrement < 0) {
      toast.error("Informe um acréscimo válido (R$).");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          ai_cost_per_file: parsedPrice,
          ai_price_base_threshold: parsedThreshold,
          ai_price_tier_step: parsedStep,
          ai_price_tier_increment: parsedIncrement,
        })
        .eq("id", organizationId as string);
      if (error) throw error;
      toast.success("Regra de faturamento IA atualizada!");
      queryClient.invalidateQueries({ queryKey: ["org-billing", organizationId] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }

  // Pré-visualização da regra com os valores em edição
  const previewPrice = Number(String(price).replace(",", "."));
  const previewThreshold = Math.floor(Number(String(baseThreshold).replace(",", ".")));
  const previewStep = Math.floor(Number(String(tierStep).replace(",", ".")));
  const previewIncrement = Number(String(tierIncrement).replace(",", "."));
  const previewValid =
    Number.isFinite(previewPrice) &&
    Number.isFinite(previewThreshold) &&
    Number.isFinite(previewStep) &&
    previewStep > 0 &&
    Number.isFinite(previewIncrement);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custo da indexação por IA</CardTitle>
        <CardDescription>
          Configure o preço base por arquivo e a regra de acréscimo por volume de tokens.
          Aplica-se a novos processamentos — logs antigos preservam o custo registrado na época.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ai-cost">Preço base por arquivo (R$)</Label>
                <Input
                  id="ai-cost"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.15"
                />
                <p className="text-xs text-muted-foreground">
                  Valor cobrado até o limite de tokens abaixo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-threshold">Limite de tokens no preço base</Label>
                <Input
                  id="ai-threshold"
                  inputMode="numeric"
                  value={baseThreshold}
                  onChange={(e) => setBaseThreshold(e.target.value)}
                  placeholder="1100"
                />
                <p className="text-xs text-muted-foreground">
                  Até esta quantidade de tokens totais (prompt + completion), cobra apenas o preço base.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-step">Tamanho do bloco adicional (tokens)</Label>
                <Input
                  id="ai-step"
                  inputMode="numeric"
                  value={tierStep}
                  onChange={(e) => setTierStep(e.target.value)}
                  placeholder="500"
                />
                <p className="text-xs text-muted-foreground">
                  A cada bloco extra de tokens acima do limite, soma-se o acréscimo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-increment">Acréscimo por bloco (R$)</Label>
                <Input
                  id="ai-increment"
                  inputMode="decimal"
                  value={tierIncrement}
                  onChange={(e) => setTierIncrement(e.target.value)}
                  placeholder="0.01"
                />
                <p className="text-xs text-muted-foreground">
                  Valor somado a cada bloco adicional. Ex.: 0.01 = R$ 0,01.
                </p>
              </div>
            </div>

            {previewValid && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="text-sm font-medium">Pré-visualização da regra</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>Até {previewThreshold.toLocaleString("pt-BR")} tokens → {fmt(previewPrice)}</li>
                  <li>
                    {(previewThreshold + previewStep).toLocaleString("pt-BR")} tokens →{" "}
                    {fmt(previewPrice + previewIncrement)}
                  </li>
                  <li>
                    {(previewThreshold + previewStep * 2).toLocaleString("pt-BR")} tokens →{" "}
                    {fmt(previewPrice + previewIncrement * 2)}
                  </li>
                  <li>
                    {(previewThreshold + previewStep * 5).toLocaleString("pt-BR")} tokens →{" "}
                    {fmt(previewPrice + previewIncrement * 5)}
                  </li>
                </ul>
              </div>
            )}

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar regra
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}



function ProfileSettings({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.full_name || "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
    } catch (error: any) {
      toast.error("Erro ao atualizar perfil: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu Perfil</CardTitle>
        <CardDescription>
          Como as outras pessoas verão você no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input 
            id="name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Seu nome"
          />
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationSettings({ organization, isAdmin }: { organization: any; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(organization?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!isAdmin) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name })
        .eq("id", organization.id);

      if (error) throw error;
      toast.success("Organização atualizada!");
      queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
    } catch (error: any) {
      toast.error("Erro ao atualizar organização: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
          <CardDescription>
            Detalhes da sua empresa ou workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome da Organização</Label>
            <Input 
              id="org-name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Identificador (Slug)</Label>
            <Input id="org-slug" value={organization?.slug || ""} disabled />
            <p className="text-[10px] text-muted-foreground">
              O slug é usado na URL e não pode ser alterado.
            </p>
          </div>
          {isAdmin && (
            <div className="pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar organização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <CardTitle>Armazenamento</CardTitle>
          </div>
          <CardDescription>
            Configurações de infraestrutura de arquivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <div className="font-medium flex items-center gap-2">
                Google Drive
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Conectado</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Todos os arquivos são armazenados no Drive da CARS.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersSettings({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();
  
  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          id,
          role,
          user_id,
          profiles:user_id (
            full_name,
            id
          )
        `)
        .eq("org_id", organizationId as string);
      
      if (error) throw error;
      return data;
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: any }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      queryClient.invalidateQueries({ queryKey: ["org-members", organizationId] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar cargo: " + error.message);
    }
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            Gerencie quem tem acesso a esta organização.
          </CardDescription>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Convidar
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member: any) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.profiles?.full_name || "Sem nome"}
                </TableCell>
                <TableCell>
                  <Select 
                    defaultValue={member.role} 
                    onValueChange={(val) => updateRoleMutation.mutate({ memberId: member.id, role: val })}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Administrador</SelectItem>
                      <SelectItem value="operator">Operador</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NotificationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de Notificação</CardTitle>
        <CardDescription>
          Escolha como e quando você quer ser notificado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <Label>Emails de processamento</Label>
            <p className="text-sm text-muted-foreground">Receba um alerta quando um lote de documentos for finalizado.</p>
          </div>
          <div className="flex items-center h-6">
             <Badge variant="outline">Em breve</Badge>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <Label>Alertas de erro</Label>
            <p className="text-sm text-muted-foreground">Seja notificado imediatamente se um upload falhar.</p>
          </div>
          <div className="flex items-center h-6">
             <Badge variant="outline">Em breve</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
