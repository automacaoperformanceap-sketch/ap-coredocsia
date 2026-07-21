/**
 * Instrumentação leve de performance para o pipeline de upload.
 *
 * Uso:
 *   const out = await measure("crop", () => cropImageHalf(f, mode), { fileName, sizeIn: f.size });
 *
 * Loga no console (grupo colapsado) e também emite um CustomEvent
 * `lovable:perf` no window, permitindo que outras camadas (ex.: painel
 * de diagnóstico ou export CSV) consumam as métricas sem acoplamento.
 */
export interface PerfSample {
  step: string;
  ms: number;
  ts: number;
  meta?: Record<string, unknown>;
}

const buffer: PerfSample[] = [];
const MAX_BUFFER = 500;

export function recordSample(sample: PerfSample) {
  buffer.push(sample);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("lovable:perf", { detail: sample }));
    } catch {
      /* noop */
    }
  }
}

export function getPerfSamples(): PerfSample[] {
  return buffer.slice();
}

export function clearPerfSamples() {
  buffer.length = 0;
}

export async function measure<T>(
  step: string,
  fn: () => Promise<T> | T,
  meta?: Record<string, unknown>,
): Promise<T> {
  const t0 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  try {
    const out = await fn();
    const ms = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
    );
    const enriched: Record<string, unknown> = { ...(meta ?? {}) };
    if (out instanceof File || out instanceof Blob) {
      enriched.sizeOut = (out as Blob).size;
    }
    recordSample({ step, ms, ts: Date.now(), meta: enriched });
    // eslint-disable-next-line no-console
    console.info(`[perf] ${step} ${ms}ms`, enriched);
    return out;
  } catch (err) {
    const ms = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0,
    );
    recordSample({ step: `${step}:error`, ms, ts: Date.now(), meta });
    // eslint-disable-next-line no-console
    console.warn(`[perf] ${step} FAIL ${ms}ms`, err);
    throw err;
  }
}

/** Resumo agregado por passo — útil para exibir no painel de diagnóstico. */
export function summarize(samples: PerfSample[] = buffer) {
  const byStep = new Map<string, { count: number; total: number; max: number; min: number }>();
  for (const s of samples) {
    const cur = byStep.get(s.step) ?? { count: 0, total: 0, max: 0, min: Infinity };
    cur.count += 1;
    cur.total += s.ms;
    cur.max = Math.max(cur.max, s.ms);
    cur.min = Math.min(cur.min, s.ms);
    byStep.set(s.step, cur);
  }
  return Array.from(byStep.entries()).map(([step, v]) => ({
    step,
    count: v.count,
    avg: Math.round(v.total / v.count),
    min: v.min === Infinity ? 0 : v.min,
    max: v.max,
    total: v.total,
  }));
}

if (typeof window !== "undefined") {
  (window as unknown as { __lovablePerf?: unknown }).__lovablePerf = {
    samples: getPerfSamples,
    summary: () => summarize(),
    clear: clearPerfSamples,
  };
}
