/**
 * Regra de precificação por arquivo processado por IA:
 * - Até `baseThreshold` tokens totais (prompt + completion): preço base
 * - Acima do limite, cada fração de `tierStep` tokens: + `tierIncrement`
 *   (arredondamento para cima — qualquer excesso conta como bloco completo)
 *
 * Ex. (default 1100/500/0,01): 1.100 → base | 1.101 → base+0,01 | 1.600 → base+0,01 | 1.601 → base+0,02 ...
 */
export const AI_PRICE_BASE_THRESHOLD = 1100;
export const AI_PRICE_TIER_STEP = 500;
export const AI_PRICE_TIER_INCREMENT = 0.01;

export interface AiPricingRule {
  baseThreshold?: number;
  tierStep?: number;
  tierIncrement?: number;
}

export function computeAiCost(
  promptTokens: number,
  basePrice = 0.15,
  rule: AiPricingRule = {},
): number {
  const tokens = Math.max(0, Math.floor(promptTokens || 0));
  const baseThreshold = Number.isFinite(rule.baseThreshold) && (rule.baseThreshold as number) >= 0
    ? Math.floor(rule.baseThreshold as number)
    : AI_PRICE_BASE_THRESHOLD;
  const tierStep = Number.isFinite(rule.tierStep) && (rule.tierStep as number) > 0
    ? Math.floor(rule.tierStep as number)
    : AI_PRICE_TIER_STEP;
  const tierIncrement = Number.isFinite(rule.tierIncrement) && (rule.tierIncrement as number) >= 0
    ? Number(rule.tierIncrement)
    : AI_PRICE_TIER_INCREMENT;

  if (tokens <= baseThreshold) return Number(basePrice);
  const extraTiers = Math.ceil((tokens - baseThreshold) / tierStep);
  return Number(basePrice) + extraTiers * tierIncrement;
}

