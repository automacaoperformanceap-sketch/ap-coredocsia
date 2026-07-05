import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowDown, ArrowUp, Copy, Database, FileType, KeyRound, ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LookupImportDialog } from "@/components/lookup-import-dialog";
import { toast } from "sonner";


import { PageHeader } from "@/components/page-stub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  createDocTypeTable,
  addDocTypeColumn,
  dropDocTypeColumn,
} from "@/lib/doc-type-storage.functions";


export const Route = createFileRoute("/_authenticated/cadastro/tipo-documento")({
  component: TipoDocumentoPage,
});

const schema = z.object({
  company_id: z.string().uuid("Selecione a empresa"),
  name: z.string().trim().min(1, "Informe o nome").max(150),
  slug: z.string().trim().max(150).optional().or(z.literal("")),
  store_files: z.boolean(),
});
type FormVals = z.infer<typeof schema>;

interface CompanyOpt {
  id: string;
  name: string;
}
interface DocTypeRow {
  id: string;
  org_id: string;
  company_id: string | null;
  name: string;
  slug: string;
  created_at: string;
  store_files: boolean;
}

const emptyForm: FormVals = { company_id: "", name: "", slug: "", store_files: true };


function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function TipoDocumentoPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const queryClient = useQueryClient();

  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocTypeRow | null>(null);
  const [form, setForm] = useState<FormVals>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormVals, string>>>({});
  const [fieldsFor, setFieldsFor] = useState<DocTypeRow | null>(null);

  const companies = useQuery({
    queryKey: ["companies-min", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CompanyOpt[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("org_id", orgId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["doc-types", orgId, selectedCompany],
    enabled: !!orgId && !!selectedCompany,
    queryFn: async (): Promise<DocTypeRow[]> => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("org_id", orgId!)
        .eq("company_id", selectedCompany)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DocTypeRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: FormVals) => {
      if (!orgId) throw new Error("Organização não selecionada");
      const slug = (payload.slug?.trim() || slugify(payload.name)) || slugify(payload.name);
      const row = {
        org_id: orgId,
        company_id: payload.company_id,
        name: payload.name.trim(),
        slug,
        store_files: payload.store_files,
      };
      if (editing) {
        const { error } = await supabase
          .from("document_types")
          .update(row)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("document_types")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        // Cria tabela física dedicada para o novo tipo
        if (created?.id) {
          await createDocTypeTable({ data: { typeId: created.id } });
        }

      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tipo atualizado" : "Tipo cadastrado");
      queryClient.invalidateQueries({ queryKey: ["doc-types"] });
      closeDialog();
    },
    onError: (e: any) => {
      const msg = e?.message ?? "";
      const code = e?.code ?? "";
      if (code === "23505" || msg.includes("unique constraint") || msg.includes("duplicate key")) {
        toast.error("Já existe um tipo de documento com este nome para a empresa selecionada.");
        return;
      }
      toast.error(msg || "Erro ao salvar tipo de documento.");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo removido");
      queryClient.invalidateQueries({ queryKey: ["doc-types"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (source: DocTypeRow) => {
      if (!orgId) throw new Error("Organização não selecionada");
      // Gera nome/slug únicos com sufixo incremental
      const existing = (list.data ?? []).map((r) => r.name.toLowerCase());
      let n = 1;
      let newName = `${source.name} (cópia)`;
      while (existing.includes(newName.toLowerCase())) {
        n += 1;
        newName = `${source.name} (cópia ${n})`;
      }
      const newSlug = slugify(newName);

      const { data: created, error: insErr } = await supabase
        .from("document_types")
        .insert({
          org_id: orgId,
          company_id: source.company_id,
          name: newName,
          slug: newSlug,
          store_files: source.store_files ?? true,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const newId = created!.id as string;

      // Copia campos de indexação
      const { data: srcFields, error: fErr } = await supabase
        .from("document_type_fields")
        .select("label, field_key, field_type, required, position, options, is_lookup_key, expected_length, location_hint")
        .eq("document_type_id", source.id)
        .order("position");
      if (fErr) throw fErr;

      if (srcFields && srcFields.length > 0) {
        const rows = srcFields.map((f) => ({
          ...f,
          org_id: orgId,
          document_type_id: newId,
        }));
        const { error: bulkErr } = await supabase
          .from("document_type_fields")
          .insert(rows as never);
        if (bulkErr) throw bulkErr;
      }

      // Cria tabela física e colunas
      try {
        await createDocTypeTable({ data: { typeId: newId } });
        for (const f of srcFields ?? []) {
          await addDocTypeColumn({
            data: { typeId: newId, fieldKey: f.field_key, fieldType: f.field_type },
          });
        }
      } catch (e) {
        console.error("Falha ao criar tabela física do tipo duplicado", e);
      }
    },
    onSuccess: () => {
      toast.success("Tipo duplicado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["doc-types"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao duplicar tipo."),
  });

  const companyName = useMemo(
    () => companies.data?.find((c) => c.id === selectedCompany)?.name ?? "",
    [companies.data, selectedCompany],
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, company_id: selectedCompany });
    setErrors({});
    setOpen(true);
  }
  function openEdit(r: DocTypeRow) {
    setEditing(r);
    setForm({ company_id: r.company_id ?? "", name: r.name, slug: r.slug, store_files: r.store_files ?? true });
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
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Partial<Record<keyof FormVals, string>> = {};
      parsed.error.issues.forEach((i) => {
        fe[i.path[0] as keyof FormVals] = i.message;
      });
      setErrors(fe);
      return;
    }
    upsert.mutate(parsed.data);
  }

  const hasCompanies = (companies.data?.length ?? 0) > 0;

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
              <FileType className="h-6 w-6 text-blue-800" />
              Tipo Documento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Cadastre tipos de documento por empresa.</p>
          </div>
          <Button onClick={openCreate} disabled={!selectedCompany} className="bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 hover:from-slate-900 hover:via-blue-900 hover:to-sky-800 text-white border-0 shadow-lg shadow-blue-800/30">
            <Plus className="h-4 w-4 mr-2" /> Novo tipo
          </Button>
        </div>
      </div>


      <div className="mb-4 max-w-md space-y-1.5">
        <Label>Empresa</Label>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger>
            <SelectValue
              placeholder={hasCompanies ? "Selecione a empresa" : "Cadastre uma empresa primeiro"}
            />
          </SelectTrigger>
          <SelectContent>
            {(companies.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="w-36 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!selectedCompany ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12 text-sm text-muted-foreground">
                  Selecione uma empresa para visualizar seus tipos de documento.
                </TableCell>
              </TableRow>
            ) : list.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 3 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (list.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-12">
                  <div className="mx-auto h-12 w-12 rounded-lg bg-accent grid place-items-center mb-3">
                    <FileType className="h-6 w-6 text-accent-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Nenhum tipo cadastrado para {companyName}.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              (list.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setFieldsFor(r)}
                        className="mr-1"
                      >
                        <ListChecks className="h-4 w-4 mr-1" /> Campos
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Duplicar "${r.name}" com todos os campos de indexação?`)) {
                            duplicate.mutate(r);
                          }
                        }}
                        disabled={duplicate.isPending}
                        aria-label="Duplicar"
                        title="Duplicar tipo e campos"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover "${r.name}"?`)) remove.mutate(r.id);
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
            <DialogTitle>{editing ? "Editar tipo" : "Novo tipo de documento"}</DialogTitle>
            <DialogDescription>
              Cada empresa pode ter vários tipos de documento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select
                value={form.company_id}
                onValueChange={(v) => setForm((f) => ({ ...f, company_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(companies.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.company_id && (
                <p className="text-xs text-destructive">{errors.company_id}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome do Tipo *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: editing ? f.slug : slugify(e.target.value),
                  }))
                }
                autoFocus
                placeholder="Ex.: Nota Fiscal"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="nota-fiscal"
              />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
            </div>
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.store_files}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, store_files: v === true }))}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Armazenar imagens no Google Drive</p>
                  <p className="text-xs text-muted-foreground">
                    Se desmarcado, apenas os dados indexados serão salvos no banco — o arquivo
                    original não fica disponível para visualização no GED.
                  </p>
                </div>
              </label>
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

      <FieldsDialog
        docType={fieldsFor}
        orgId={orgId}
        onClose={() => setFieldsFor(null)}
      />
    </div>
  );
}

interface FieldRow {
  id: string;
  document_type_id: string;
  org_id: string;
  label: string;
  field_key: string;
  field_type: "text" | "number" | "date" | "boolean" | "select";
  required: boolean;
  position: number;
  is_lookup_key: boolean;
  expected_length: number | null;
  location_hint: string | null;
}

function FieldsDialog({
  docType,
  orgId,
  onClose,
}: {
  docType: DocTypeRow | null;
  orgId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldType, setFieldType] = useState<FieldRow["field_type"]>("text");
  const [required, setRequired] = useState(false);
  const [isLookupKey, setIsLookupKey] = useState(false);
  const [expectedLength, setExpectedLength] = useState<string>("");
  const [locationHint, setLocationHint] = useState<string>("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setEditingLabel(null);
    setLabel("");
    setFieldKey("");
    setFieldType("text");
    setRequired(false);
    setIsLookupKey(false);
    setExpectedLength("");
    setLocationHint("");
  };

  const startEdit = (f: FieldRow) => {
    setEditingId(f.id);
    setEditingLabel(f.label);
    setLabel(f.label);
    setFieldKey(f.field_key);
    setFieldType(f.field_type);
    setRequired(f.required);
    setIsLookupKey(!!f.is_lookup_key);
    setExpectedLength(f.expected_length != null ? String(f.expected_length) : "");
    setLocationHint(f.location_hint ?? "");
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      labelInputRef.current?.focus();
    }, 50);
  };



  const fields = useQuery({
    queryKey: ["doc-type-fields", docType?.id],
    enabled: !!docType,
    queryFn: async (): Promise<FieldRow[]> => {
      const { data, error } = await supabase
        .from("document_type_fields")
        .select("*")
        .eq("document_type_id", docType!.id)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as FieldRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!docType || !orgId) throw new Error("Contexto inválido");
      const key = (fieldKey.trim() || slugify(label)).replace(/-/g, "_");
      if (!label.trim()) throw new Error("Informe o rótulo");
      if (!key) throw new Error("Informe a chave do campo");
      let expLen: number | null = null;
      if (expectedLength.trim()) {
        const n = Number(expectedLength.trim());
        if (!Number.isInteger(n) || n <= 0 || n > 4000) {
          throw new Error("Qtd. de caracteres deve ser um inteiro entre 1 e 4000");
        }
        expLen = n;
      }
      if (editingId) {
        const { error } = await supabase
          .from("document_type_fields")
          .update({
            label: label.trim(),
            field_key: key,
            field_type: fieldType,
            required,
            is_lookup_key: isLookupKey,
            expected_length: expLen,
            location_hint: locationHint.trim() || null,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const position = (fields.data?.length ?? 0) + 1;
        const { error } = await supabase.from("document_type_fields").insert({
          org_id: orgId,
          document_type_id: docType.id,
          label: label.trim(),
          field_key: key,
          field_type: fieldType,
          required,
          is_lookup_key: isLookupKey,
          expected_length: expLen,
          location_hint: locationHint.trim() || null,
          position,
        });
        if (error) throw error;
        // Adiciona coluna correspondente na tabela física do tipo (no-op se tipo antigo)
        await addDocTypeColumn({
          data: { typeId: docType.id, fieldKey: key, fieldType },
        });

      }

    },
    onSuccess: () => {
      toast.success(editingId ? "Campo atualizado" : "Campo adicionado");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["doc-type-fields", docType?.id] });
      queryClient.invalidateQueries({ queryKey: ["document-type-fields", docType?.id] });
    },
    onError: (e: any) => {
      const msg = e?.message ?? "";
      if (e?.code === "23505" || msg.includes("ux_dtf_one_lookup_key")) {
        toast.error("Só é permitido um Campo-chave por tipo de documento.");
        return;
      }
      toast.error(msg || "Erro ao salvar campo.");
    },

  });

  const removeField = useMutation({
    mutationFn: async (id: string) => {
      const target = (fields.data ?? []).find((f) => f.id === id);
      const { error } = await supabase.from("document_type_fields").delete().eq("id", id);
      if (error) throw error;
      if (target && docType) {
        await dropDocTypeColumn({
          data: { typeId: docType.id, fieldKey: target.field_key },
        });
      }

    },
    onSuccess: () => {
      toast.success("Campo removido");
      queryClient.invalidateQueries({ queryKey: ["doc-type-fields", docType?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveField = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const list = [...(fields.data ?? [])].sort((a, b) => a.position - b.position);
      const idx = list.findIndex((f) => f.id === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
      const a = list[idx];
      const b = list[swapIdx];
      // Two-step swap to avoid unique constraint collisions if any exist
      const { error: e1 } = await supabase
        .from("document_type_fields")
        .update({ position: -1 })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("document_type_fields")
        .update({ position: a.position })
        .eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("document_type_fields")
        .update({ position: b.position })
        .eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-type-fields", docType?.id] });
      queryClient.invalidateQueries({ queryKey: ["document-type-fields", docType?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!docType} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1100px] w-[95vw]">
        <DialogHeader>
          <DialogTitle>Campos de indexação — {docType?.name}</DialogTitle>
          <DialogDescription>
            Defina os campos usados para indexar e buscar documentos deste tipo.
          </DialogDescription>
        </DialogHeader>

        {docType && orgId && (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Base de lookup para preenchimento automático
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLookupOpen(true)}
            >
              <Database className="h-4 w-4 mr-1" /> Importar base (CSV/XLSX)
            </Button>
          </div>
        )}

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rótulo</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Obrig.</TableHead>
                <TableHead>Qtd.</TableHead>
                <TableHead>Lookup</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(fields.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">
                    Nenhum campo definido.
                  </TableCell>
                </TableRow>
              ) : (
                (fields.data ?? []).map((f, idx, arr) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell className="text-muted-foreground">{f.field_key}</TableCell>
                    <TableCell className="text-muted-foreground">{f.field_type}</TableCell>
                    <TableCell className="text-muted-foreground">{f.required ? "Sim" : "Não"}</TableCell>
                    <TableCell className="text-muted-foreground">{f.expected_length ?? "—"}</TableCell>

                    <TableCell>
                      {f.is_lookup_key ? (
                        <Badge variant="default" className="gap-1">
                          <KeyRound className="h-3 w-3" /> Chave
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => moveField.mutate({ id: f.id, dir: -1 })}
                          disabled={idx === 0 || moveField.isPending}
                          aria-label="Mover para cima"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => moveField.mutate({ id: f.id, dir: 1 })}
                          disabled={idx === arr.length - 1 || moveField.isPending}
                          aria-label="Mover para baixo"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(f)}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeField.mutate(f.id)}
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


        {editingId && (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm flex items-center justify-between">
            <span>
              Editando campo:{" "}
              <strong>{editingLabel ?? ""}</strong>
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              Cancelar edição
            </Button>
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2"
        >
          <div className="md:col-span-4 space-y-1.5">
            <Label>Rótulo</Label>
            <Input ref={labelInputRef} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Número NF" />
          </div>
          <div className="md:col-span-3 space-y-1.5">
            <Label>Chave</Label>
            <Input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="numero_nf"
            />
          </div>
          <div className="md:col-span-3 space-y-1.5">
            <Label>Tipo</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldRow["field_type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="date">Data</SelectItem>
                <SelectItem value="boolean">Sim/Não</SelectItem>
                <SelectItem value="select">Lista</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Qtd. caracteres</Label>
            <Input
              type="number"
              min={1}
              max={4000}
              value={expectedLength}
              onChange={(e) => setExpectedLength(e.target.value)}
              placeholder="opcional"
            />
          </div>
          <div className="md:col-span-12 space-y-1.5">
            <Label>Localização no documento (dica para a IA)</Label>
            <Textarea
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              placeholder='Ex.: "Canto superior direito, logo abaixo do número da nota fiscal" ou "Rodapé da página, ao lado do CNPJ"'
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Descreva onde o campo costuma aparecer no documento para
              ajudar a IA a localizá-lo durante a extração.
            </p>
          </div>
          <div className="md:col-span-12 flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={required}
                onCheckedChange={(c) => setRequired(c === true)}
              />
              Campo obrigatório
            </label>
          </div>

          <div className="md:col-span-12 flex items-center gap-2 -mt-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={isLookupKey}
                onCheckedChange={(c) => setIsLookupKey(c === true)}
              />
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              Campo-chave (lookup) — usado para preenchimento automático
            </label>
          </div>
          <div className="md:col-span-12 flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar edição
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              {save.isPending
                ? "Salvando..."
                : editingId
                  ? "Salvar alterações"
                  : "Adicionar campo"}
            </Button>
          </div>
        </form>

        {docType && orgId && (
          <LookupImportDialog
            open={lookupOpen}
            onOpenChange={setLookupOpen}
            documentTypeId={docType.id}
            orgId={orgId}
            companyId={docType.company_id ?? null}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

