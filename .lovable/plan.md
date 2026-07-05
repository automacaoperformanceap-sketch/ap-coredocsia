
## Objetivo

Permitir que cada **Tipo de Documento** tenha uma **base de lookup** importada de CSV/planilha. Ao indexar um documento, o usuário digita o **campo-chave** (ex.: `LOTE` para FAPEC/UFMS) e os demais campos são preenchidos automaticamente a partir dessa base.

---

## Como vai funcionar (visão do usuário)

1. Em **Cadastro → Tipo Documento → Campos**, marque um dos campos como **"Campo-chave (lookup)"** (ex.: `LOTE`).
2. No mesmo diálogo, novo botão **"Importar base (CSV/XLSX)"** abre um wizard:
   - Upload do arquivo
   - Mapear colunas do arquivo ↔ campos do tipo de documento (uma coluna deve ser o campo-chave)
   - Pré-visualizar 5 linhas e confirmar
   - Opção: **substituir** base atual ou **acrescentar/atualizar** (upsert por chave)
3. Exibir contador: *"Base atual: 1.245 registros · última atualização 22/06/2026"* com botão **Limpar base**.
4. Na tela de **Upload → Indexação**, o campo-chave ganha um ícone de busca. Ao perder o foco (ou Enter), o sistema consulta a base; se encontrar, preenche os demais campos automaticamente (usuário pode editar). Se não encontrar, toast informativo e segue manual.

---

## Mudanças no banco

Nova tabela `document_type_lookups` (uma linha = um registro da base, escopo por tipo de documento):

```text
document_type_lookups
├── id (uuid PK)
├── org_id (uuid, FK organizations)
├── company_id (uuid, FK companies)
├── document_type_id (uuid, FK document_types ON DELETE CASCADE)
├── key_value (text)              -- valor do campo-chave normalizado (trim/upper)
├── values (jsonb)                -- { "razao_social": "...", "cidade": "..." }
├── created_at / updated_at
└── UNIQUE (document_type_id, key_value)
```

Em `document_type_fields`, nova coluna `is_lookup_key boolean default false`. Trigger garante **no máximo 1 campo-chave por tipo de documento**.

GRANTs para `authenticated` + `service_role`. RLS escopado por `org_id` via `is_org_member`.

---

## Mudanças no frontend

- `src/routes/_authenticated/cadastro.tipo-documento.tsx` — no `FieldsDialog`:
  - Checkbox **"Campo-chave (lookup)"** por campo
  - Botão **"Importar base"** abre `LookupImportDialog`
  - Painel com contagem de registros + botão limpar
- Novo `src/components/lookup-import-dialog.tsx` — wizard 3 passos (upload, mapeamento, confirmação). Parsing client-side com `xlsx` (já permite CSV e XLSX).
- Novo hook `src/hooks/use-document-type-lookup.ts` — `lookupByKey(documentTypeId, key)`.
- `src/routes/_authenticated/upload.tsx` — no formulário de indexação, ao sair do campo marcado como `is_lookup_key`, chamar lookup e preencher demais campos (sem sobrescrever valores já editados pelo usuário).

---

## Detalhes técnicos

- **Normalização da chave**: `trim()` + `toUpperCase()` na gravação e na consulta para evitar mismatch por espaço/caixa.
- **Upsert** em massa via `supabase.from('document_type_lookups').upsert(rows, { onConflict: 'document_type_id,key_value' })` em lotes de 500.
- **Limites**: arquivo até 5 MB, até 50.000 linhas por importação (validado no client).
- **Dependência nova**: `xlsx` (SheetJS) para ler CSV/XLSX no navegador.
- **Segurança**: importação só por membros da organização; RLS bloqueia leitura/escrita cruzada entre orgs.

---

## Entregáveis

1. Migration: tabela `document_type_lookups` + coluna `is_lookup_key` + trigger de unicidade + GRANTs + RLS.
2. `LookupImportDialog` com wizard de importação CSV/XLSX.
3. Integração no `FieldsDialog` (marcar chave + abrir importação + status da base).
4. Auto-preenchimento na tela de Upload ao sair do campo-chave.
5. Toast de sucesso/erro e contador de registros importados.

Sem mudanças em outras áreas do sistema.
