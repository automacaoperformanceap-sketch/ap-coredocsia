import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface FieldDef {
  label: string;
  field_key: string;
  field_type: string;
  options?: unknown;
  expected_length?: number | null;
  location_hint?: string | null;
}

const DEFAULT_MODEL = "grok-build-0.1";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Extrai valores de indexação da PRIMEIRA PÁGINA de um documento (imagem/PDF)
 * via API da xAI (Grok) e grava log de auditoria em `ai_usage_logs`.
 */
export const extractFieldsWithGrok = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("FormData é obrigatório");
    return data;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!apiKey) throw new Error("GROK_API_KEY não configurado no servidor");

    const file = data.get("file");
    const fieldsJson = String(data.get("fields") ?? "[]");
    const companyId = (data.get("companyId") as string) || null;
    const documentTypeId = (data.get("documentTypeId") as string) || null;
    const maxPagesRaw = parseInt(String(data.get("maxPages") ?? "1"), 10);
    const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw >= 0 && maxPagesRaw <= 10 ? maxPagesRaw : 1;

    if (!(file instanceof File)) throw new Error("Arquivo ausente ou inválido");
    const uploadFile: File = file;

    let fields: FieldDef[] = [];
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      throw new Error("fields inválido (JSON malformado)");
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return { values: {} as Record<string, string>, usage: null };
    }

    const { supabase, userId } = context;

    const [{ data: profile }, companyRes, typeRes] = await Promise.all([
      supabase.from("profiles").select("current_org_id").eq("id", userId).maybeSingle(),
      companyId
        ? supabase.from("companies").select("name").eq("id", companyId).maybeSingle()
        : Promise.resolve({ data: null }),
      documentTypeId
        ? supabase.from("document_types").select("name").eq("id", documentTypeId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const orgId = profile?.current_org_id ?? null;
    const companyName = (companyRes?.data as { name?: string } | null)?.name ?? null;
    const documentTypeName = (typeRes?.data as { name?: string } | null)?.name ?? null;

    let MODEL = DEFAULT_MODEL;
    if (orgId) {
      const { data: orgModel } = await supabase
        .from("organizations")
        .select("ai_grok_model")
        .eq("id", orgId)
        .maybeSingle();
      if (orgModel?.ai_grok_model) MODEL = orgModel.ai_grok_model;
    }
    const overrideModel = (data.get("model") as string) || null;
    if (overrideModel) MODEL = overrideModel;


    async function writeFailureLog(args: {
      prompt: number;
      completion: number;
      total: number;
      error?: string;
    }) {
      if (!orgId) return;
      await supabase.from("ai_usage_logs").insert({
        org_id: orgId,
        user_id: userId,
        company_id: companyId,
        company_name: companyName,
        document_type_id: documentTypeId,
        document_type_name: documentTypeName,
        file_name: uploadFile.name,
        model: MODEL,
        prompt_tokens: args.prompt,
        completion_tokens: args.completion,
        total_tokens: args.total,
        success: false,
        error_message: args.error ?? null,
      });
    }

    const mimeType = uploadFile.type || "application/octet-stream";
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(mimeType);
    if (!isImage) {
      await writeFailureLog({
        prompt: 0,
        completion: 0,
        total: 0,
        error: `Tipo de arquivo não suportado pelo Grok: ${mimeType}`,
      });
      throw new Error(
        "Grok aceita apenas imagens (JPG, PNG, GIF, WEBP). Converta antes de enviar.",
      );
    }

    const buf = await uploadFile.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUri = `data:${mimeType};base64,${base64}`;

    const schemaDesc = fields
      .map((f) => {
        const isMatricula = f.field_key.toLowerCase().includes("matricula");
        let desc = `- "${f.field_key}" — rótulo: "${f.label}", tipo: ${f.field_type}`;
        if (isMatricula) {
          desc += `, APENAS NÚMEROS (remova letras, pontos, traços, barras e espaços)`;
        }
        if (f.field_type === "select" && Array.isArray(f.options)) {
          desc += `, opções permitidas: ${(f.options as string[]).join(" | ")}`;
        }
        if (f.expected_length && f.expected_length > 0) {
          desc += `, deve conter EXATAMENTE ${f.expected_length} caracteres (sem espaços em branco); se não encontrar com esse tamanho, retorne ""`;
        }
        if (f.location_hint && f.location_hint.trim()) {
          desc += `\n    >>> DICA DE LOCALIZAÇÃO (SIGA OBRIGATORIAMENTE): procure o valor deste campo EXATAMENTE em: "${f.location_hint.trim()}". Use esta dica como instrução primária. Se não encontrar, retorne "".`;
        }
        return desc;
      })
      .join("\n");

    const prompt = `Você é um extrator de dados de documentos digitalizados.
Analise ${maxPages > 1 ? `AS ${maxPages} PRIMEIRAS PÁGINAS` : "SOMENTE A PRIMEIRA PÁGINA"} do documento anexado e extraia os campos abaixo.

Campos:
${schemaDesc}

Regras de saída (siga RIGOROSAMENTE):
- Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown, sem comentários, sem texto extra.
- Use exatamente as chaves listadas (field_key).
- Campos "date": formato "DD/MM/AAAA".
- Campos "number": apenas o número, sem símbolo de moeda; ponto como decimal.
- Campos cujo field_key contenha "matricula": APENAS dígitos numéricos.
- Campos "select": EXATAMENTE um dos valores permitidos.
- Demais campos (text/textarea): LETRAS MAIÚSCULAS.
- Se um campo definir tamanho exato, o valor NÃO pode conter espaços e deve ter exatamente esse tamanho; senão retorne "".
- Se não encontrar com confiança, retorne "".`;

    const requestBody = JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    });

    const MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const startedAt = Date.now();
    let resp: Response | null = null;
    let lastErrText = "";
    let lastStatus = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const r = await fetch(XAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: requestBody,
        });
        if (r.ok) {
          resp = r;
          break;
        }
        lastStatus = r.status;
        lastErrText = await r.text();
        const retriable = r.status === 529 || r.status === 429 || r.status >= 500;
        if (!retriable) {
          resp = r;
          break;
        }
        await sleep(1000 * Math.pow(2, attempt));
      } catch (e: any) {
        lastErrText = `network: ${e?.message ?? "fetch failed"}`;
        lastStatus = 0;
        await sleep(1000 * Math.pow(2, attempt));
      }
    }

    if (!resp || !resp.ok) {
      await writeFailureLog({
        prompt: 0,
        completion: 0,
        total: 0,
        error: `Grok ${lastStatus || "network"}: ${lastErrText.slice(0, 200)}`,
      });
      const friendly =
        lastStatus === 401
          ? "GROK_API_KEY inválida. Verifique a chave da xAI."
          : lastStatus === 429
            ? "Limite de requisições atingido (Grok). Aguarde alguns segundos."
            : lastStatus >= 500
              ? "O serviço Grok está temporariamente indisponível. Tente novamente."
              : `Falha ao processar via Grok (${lastStatus || "rede"}): ${lastErrText.slice(0, 120)}`;
      throw new Error(friendly);
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const promptTokens = json.usage?.prompt_tokens ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;
    const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;

    const text = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let extracted: Record<string, unknown> = {};
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      extracted = {};
    }

    const result: Record<string, string> = {};
    for (const f of fields) {
      const v = extracted[f.field_key];
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      const isMatricula = f.field_key.toLowerCase().includes("matricula");
      if (isMatricula) {
        result[f.field_key] = s.replace(/\D/g, "");
      } else if (f.field_type === "date") {
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (isoMatch) {
          result[f.field_key] = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
        } else if (brMatch) {
          const d = brMatch[1].padStart(2, "0");
          const m = brMatch[2].padStart(2, "0");
          const y = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
          result[f.field_key] = `${d}/${m}/${y}`;
        } else {
          result[f.field_key] = s;
        }
      } else if (f.field_type === "number") {
        result[f.field_key] = s;
      } else {
        result[f.field_key] = s.toUpperCase();
      }
      const exp = f.expected_length ?? null;
      if (exp && exp > 0) {
        const cur = result[f.field_key];
        if (!cur || /\s/.test(cur) || cur.length !== exp) {
          delete result[f.field_key];
        }
      }
    }

    let logId: string | null = null;
    if (orgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("ai_cost_per_file, ai_price_base_threshold, ai_price_tier_step, ai_price_tier_increment")
        .eq("id", orgId)
        .maybeSingle();
      const basePrice = Number(org?.ai_cost_per_file ?? 0.15);
      const { computeAiCost } = await import("./ai-pricing");
      const cost = computeAiCost(totalTokens, basePrice, {
        baseThreshold: org?.ai_price_base_threshold ?? undefined,
        tierStep: org?.ai_price_tier_step ?? undefined,
        tierIncrement:
          org?.ai_price_tier_increment != null ? Number(org.ai_price_tier_increment) : undefined,
      });

      const { data: inserted } = await supabase
        .from("ai_usage_logs")
        .insert({
          org_id: orgId,
          user_id: userId,
          company_id: companyId,
          company_name: companyName,
          document_type_id: documentTypeId,
          document_type_name: documentTypeName,
          file_name: uploadFile.name,
          model: MODEL,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          cost_brl: cost,
          duration_ms: Date.now() - startedAt,
          success: true,
        })
        .select("id")
        .single();
      logId = inserted?.id ?? null;
    }

    return {
      values: result,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        model: MODEL,
        duration_ms: Date.now() - startedAt,
        log_id: logId,
      },
    };
  });
