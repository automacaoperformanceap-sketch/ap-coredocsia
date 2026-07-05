import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Building2, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-stub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";
import { ensureCurrentOrganization } from "@/lib/organizations.functions";

export const Route = createFileRoute("/_authenticated/cadastro/empresa")({
  component: EmpresaPage,
});

const companySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa").max(150),
  cnpj: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().max(150).email("E-mail inválido").optional().or(z.literal("")),
  contact_person: z.string().trim().max(150).optional().or(z.literal("")),
});

type CompanyForm = z.infer<typeof companySchema>;

interface CompanyRow {
  id: string;
  org_id: string;
  name: string;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  created_at: string;
}

const emptyForm: CompanyForm = {
  name: "",
  cnpj: "",
  address: "",
  phone: "",
  email: "",
  contact_person: "",
};

function EmpresaPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(null);
  const effectiveOrgId = orgId ?? resolvedOrgId;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});

  const list = useQuery({
    queryKey: ["companies", effectiveOrgId],
    enabled: !!effectiveOrgId,
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("org_id", effectiveOrgId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list.data ?? [];
    return (list.data ?? []).filter((c) =>
      [c.name, c.cnpj, c.email, c.contact_person]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [list.data, search]);

  const upsert = useMutation({
    mutationFn: async (payload: CompanyForm) => {
      let activeOrgId = effectiveOrgId;
      const { data: userRes, error: userError } = await supabase.auth.getUser();

      if (userError || !userRes.user) {
        throw new Error("Sessão expirada. Entre novamente para continuar.");
      }

      if (!activeOrgId) {
        const ensured = await ensureCurrentOrganization();
        activeOrgId = ensured.orgId;
      }

      if (!activeOrgId) throw new Error("Organização não selecionada");
      const row = {
        org_id: activeOrgId,

        name: payload.name.trim(),
        cnpj: payload.cnpj?.trim() || null,
        address: payload.address?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        contact_person: payload.contact_person?.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("companies")
          .update(row)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("companies")
          .insert({ ...row, created_by: userRes.user.id });
        if (error) throw error;
      }
      return { orgId: activeOrgId };
    },
    onSuccess: ({ orgId: savedOrgId }) => {
      setResolvedOrgId(savedOrgId);
      toast.success(editing ? "Empresa atualizada" : "Empresa cadastrada");
      queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
      queryClient.invalidateQueries({ queryKey: ["companies", savedOrgId] });
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("companies")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa removida");
      queryClient.invalidateQueries({ queryKey: ["companies", effectiveOrgId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  }

  function openEdit(c: CompanyRow) {
    setEditing(c);
    setForm({
      name: c.name,
      cnpj: c.cnpj ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      contact_person: c.contact_person ?? "",
    });
    setErrors({});
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = companySchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CompanyForm, string>> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as keyof CompanyForm;
        fieldErrors[k] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    upsert.mutate(parsed.data);
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5 mb-6">
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-800" />
              Cadastro
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-800" />
              Empresa
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Cadastro de empresas da organização.</p>
          </div>
          <Button onClick={openCreate} className="bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 hover:from-slate-900 hover:via-blue-900 hover:to-sky-800 text-white border-0 shadow-lg shadow-blue-800/30">
            <Plus className="h-4 w-4 mr-2" /> Nova empresa
          </Button>
        </div>
      </div>


      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, CNPJ, e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="mx-auto h-12 w-12 rounded-lg bg-accent grid place-items-center mb-3">
                    <Building2 className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma empresa cadastrada ainda.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cnpj ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.contact_person ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(c)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover "${c.name}"?`)) remove.mutate(c.id);
                        }}
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar empresa" : "Nova empresa"}</DialogTitle>
            <DialogDescription>
              Preencha os dados da empresa. Apenas o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="Nome da Empresa *"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              error={errors.name}
              autoFocus
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="CNPJ"
                value={form.cnpj ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, cnpj: v }))}
                error={errors.cnpj}
                placeholder="00.000.000/0000-00"
              />
              <Field
                label="Telefone"
                value={form.phone ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                error={errors.phone}
                placeholder="(00) 00000-0000"
              />
            </div>
            <Field
              label="E-mail"
              type="email"
              value={form.email ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              error={errors.email}
            />
            <Field
              label="Pessoa de Contato"
              value={form.contact_person ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, contact_person: v }))}
              error={errors.contact_person}
            />
            <div className="space-y-1.5">
              <Label htmlFor="address">Endereço</Label>
              <Textarea
                id="address"
                value={form.address ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={2}
              />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
