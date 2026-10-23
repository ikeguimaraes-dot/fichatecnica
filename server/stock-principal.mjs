import { attachCosts, normalizeFicha } from "./everest.mjs";
import { measure } from "../shared/stock-ledger.mjs";

export function principalProduct(raw, tree) {
  const priced = attachCosts(normalizeFicha(raw, true), tree);
  if (priced.totalCost == null || !(priced.totalCost > 0)) return null;
  const grouped = new Map();
  for (const component of priced.components) {
    const [unit] = measure(component.unit);
    const key = `${component.itemId}:${unit}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      itemId: component.itemId,
      name: component.name,
      unit,
      appliedCost: (existing?.appliedCost || 0) + component.appliedCost,
      preparation:
        component.costBasis === "composition" || !!existing?.preparation,
    });
  }
  return (
    [...grouped.values()].sort(
      (a, b) =>
        b.appliedCost - a.appliedCost || a.name.localeCompare(b.name, "pt-BR"),
    )[0] || null
  );
}
