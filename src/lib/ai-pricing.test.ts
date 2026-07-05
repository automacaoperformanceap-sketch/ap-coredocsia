import { describe, it, expect } from "vitest";
import { computeAiCost } from "./ai-pricing";

describe("computeAiCost — arredondamento por bloco (defaults: base 1100 / step 500 / +R$0,01)", () => {
  const base = 0.15;
  const r = (n: number) => Number(n.toFixed(4));

  it.each([
    [0, 0.15],
    [1, 0.15],
    [1099, 0.15],
    [1100, 0.15],
  ])("até o limite base (%i tokens) cobra apenas o preço base", (tokens, expected) => {
    expect(r(computeAiCost(tokens, base))).toBe(expected);
  });

  it.each([
    [1101, 0.16],
    [1350, 0.16],
    [1599, 0.16],
    [1600, 0.16],
  ])("qualquer fração do 1º bloco (%i tokens) cobra como bloco cheio", (tokens, expected) => {
    expect(r(computeAiCost(tokens, base))).toBe(expected);
  });

  it.each([
    [1601, 0.17],
    [2100, 0.17],
    [2101, 0.18],
    [3100, 0.19],
    [5100, 0.23],
  ])("blocos subsequentes acumulam corretamente (%i tokens)", (tokens, expected) => {
    expect(r(computeAiCost(tokens, base))).toBe(expected);
  });

  it("respeita regra customizada da organização", () => {
    const rule = { baseThreshold: 1000, tierStep: 250, tierIncrement: 0.02 };
    expect(r(computeAiCost(1000, 0.1, rule))).toBe(0.1);
    expect(r(computeAiCost(1001, 0.1, rule))).toBe(0.12);
    expect(r(computeAiCost(1250, 0.1, rule))).toBe(0.12);
    expect(r(computeAiCost(1251, 0.1, rule))).toBe(0.14);
  });

  it("trata entradas inválidas com segurança", () => {
    expect(r(computeAiCost(-50, base))).toBe(0.15);
    expect(r(computeAiCost(NaN, base))).toBe(0.15);
  });
});
