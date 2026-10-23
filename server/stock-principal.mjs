import { attachCosts, normalizeFicha } from "./everest.mjs";
import { measure, recipeRequirements } from "../shared/stock-ledger.mjs";

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

// Parrillada is a multi-protein dish: cost availability must not hide its meats.
export function priorityProducts(raw, tree) {
  const name = String(raw?.ds_item || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (!/PARR?ILL?ADA.*CARNE/.test(name)) return [];
  const expanded = recipeRequirements(raw, tree, 1);
  const meats =
    /\b(BOVIN[OA]|SUIN[OA]|CARNE|BIFE|STEAK|PICANHA|CHORIZO|ANCHO|FRALDINHA|COSTELA|MIGNON|WAGYU|LINGUICA|CORDEIRO|FRANGO|PORCO)\b/;
  const items = expanded.reason
    ? (raw.itens || []).map((c) => ({
        itemId: Number(c.id_item),
        name: c.ds_item,
        unit: measure(c.sg_unidademedida)[0],
      }))
    : expanded.requirements;
  const unique = new Map();
  for (const item of items) {
    const normalized = String(item.name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (!meats.test(normalized) || !(item.itemId > 0) || !item.unit) continue;
    unique.set(`${item.itemId}:${item.unit}`, {
      itemId: item.itemId,
      name: item.name,
      unit: item.unit,
      appliedCost: null,
      preparation: Boolean(expanded.reason && /^PROD[.\s]/i.test(item.name)),
    });
  }
  return [...unique.values()];
}
