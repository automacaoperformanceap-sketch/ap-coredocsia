import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Upload,
  ListChecks,
  FolderOpen,
  
  FileText,
  CheckSquare,
  Archive,
  ScrollText,
  Wallet,
  Settings,
  Shield,
  LogOut,
  FileScan,
  ChevronDown,
  ChevronRight,
  Check,
  ClipboardList,
  Building2,
  FileType,
  Users,
} from "lucide-react";
import { useProfileBundle } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const navMain = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/queue", label: "Fila de processamento", icon: ListChecks },
  { to: "/documents", label: "Documentos (GED)", icon: FolderOpen },
];

const navCadastro = [
  { to: "/cadastro/empresa", label: "Empresa", icon: Building2 },
  { to: "/cadastro/tipo-documento", label: "Tipo Documento", icon: FileType },
  { to: "/cadastro/usuario", label: "Usuário", icon: Users },
];

const navConfig = [
  { to: "/templates", label: "Templates de extração", icon: FileText },
  { to: "/workflow", label: "Workflow de qualidade", icon: CheckSquare },
  { to: "/retention", label: "Retenção documental", icon: Archive },
];

const navAccount = [
  { to: "/audit", label: "Auditoria", icon: ScrollText },
  { to: "/credits", label: "Créditos", icon: Wallet },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { data, loading } = useProfileBundle();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const isViewerOnly =
    !loading &&
    !!data &&
    !data.isPlatformAdmin &&
    data.roles.length > 0 &&
    data.roles.every((r) => r === "viewer");

  const isOperatorOnly =
    !loading &&
    !!data &&
    !data.isPlatformAdmin &&
    data.roles.length > 0 &&
    data.roles.every((r) => r === "operator" || r === "viewer") &&
    data.roles.includes("operator");

  const showSecondary = !isViewerOnly && !isOperatorOnly;

  async function handleSignOut() {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    } finally {
      // Hard reload guarantees all in-memory state (cached documents,
      // preview blobs, user profile) is wiped — a client-side navigate
      // leaves the previous route's components mounted in the router cache.
      if (typeof window !== "undefined") {
        window.location.replace("/auth");
      } else {
        navigate({ to: "/auth", replace: true });
      }
    }
  }

  const initials = (data?.profile.full_name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
              <div className="h-8 w-8 rounded-md bg-sidebar-primary grid place-items-center shrink-0">
                <FileScan className="h-4 w-4 text-sidebar-primary-foreground" />
              </div>
              <span className="font-display font-bold text-base group-data-[collapsible=icon]:hidden">
                AP - CoreDocs IA
              </span>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Operação</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {(isViewerOnly
                    ? navMain.filter((i) => i.to === "/documents")
                    : navMain
                  ).map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                        <Link to={item.to}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {showSecondary && (
              <SidebarGroup>
                <SidebarGroupLabel>Cadastro</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <Collapsible
                      defaultOpen={navCadastro.some((i) => isActive(i.to))}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip="Cadastro">
                            <ClipboardList className="h-4 w-4" />
                            <span>Cadastro</span>
                            <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {navCadastro.map((item) => (
                              <SidebarMenuSubItem key={item.to}>
                                <SidebarMenuSubButton asChild isActive={isActive(item.to)}>
                                  <Link to={item.to}>
                                    <item.icon className="h-4 w-4" />
                                    <span>{item.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {showSecondary && (
              <SidebarGroup>
                <SidebarGroupLabel>Configuração</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navConfig.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {showSecondary && (
              <SidebarGroup>
                <SidebarGroupLabel>Conta</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navAccount.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                    {data?.isPlatformAdmin && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={isActive("/admin")} tooltip="Admin Plataforma">
                          <Link to="/admin">
                            <Shield className="h-4 w-4" />
                            <span>Admin Plataforma</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border bg-card/60 backdrop-blur-md supports-[backdrop-filter]:bg-card/50 flex items-center gap-3 px-4 sticky top-0 z-20">
            <SidebarTrigger />
            <div className="flex-1" />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-sm">
                    {loading ? "..." : data?.profile.full_name ?? "Usuário"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Conta
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="h-4 w-4 mr-2" /> Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function OrgSwitcher() {
  const { data } = useProfileBundle();
  const queryClient = useQueryClient();

  if (!data?.currentOrg) return null;

  async function switchTo(orgId: string) {
    await supabase
      .from("profiles")
      .update({ current_org_id: orgId })
      .eq("id", data!.profile.id);
    queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[220px]">
          <span className="h-2 w-2 rounded-full bg-success shrink-0" />
          <span className="truncate text-sm">{data.currentOrg.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organização ativa
        </DropdownMenuLabel>
        {data.organizations.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => switchTo(org.id)}>
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === data.currentOrg?.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
