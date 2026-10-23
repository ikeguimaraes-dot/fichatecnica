export const STOCK_START = "2026-10-20";
export const saleKey = (name) =>
  String(name || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
export const finite = (value) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
export function measure(unit) {
  const u = String(unit || "")
    .trim()
    .toUpperCase();
  const units = {
    KG: ["KG", 1],
    G: ["KG", 0.001],
    GR: ["KG", 0.001],
    L: ["L", 1],
    LT: ["L", 1],
    ML: ["L", 0.001],
    UN: ["UN", 1],
    UNID: ["UN", 1],
    UND: ["UN", 1],
    UNIDADE: ["UN", 1],
  };
  return units[u] || [u, 1];
}
// Everest's expanded composition already applies nested yields and utilization.
// Sum terminal qt_utilizada only; never consume both preparations and their ingredients.
export function recipeRequirements(raw, tree, outputPerSale) {
  const fail = (reason) => ({ requirements: [], reason });
  if (!(finite(raw?.qt_producao) > 0))
    return fail("Rendimento da ficha inválido");
  if (!(finite(outputPerSale) > 0))
    return fail("Informe a quantidade da ficha correspondente a uma venda");
  if (!Array.isArray(tree) || !tree.length)
    return fail("Composição expandida indisponível");
  const roots = tree.filter(
    (n) => Number(n.id_ordem) === Number(n.id_ordem_pai),
  );
  if (roots.length !== 1) return fail("Árvore de composição inválida");
  const root = roots[0];
  if (
    Number(root.id_ficha) !== Number(raw.id_fichatecnica) ||
    Number(root.id_composto) !== Number(raw.id_item) ||
    Number(root.qt_producao) !== Number(raw.qt_producao) ||
    !(finite(root.qt_utilizada) > 0) ||
    measure(root.unidade)[0] !== measure(raw.sg_unidademedida)[0]
  )
    return fail("Versão ou rendimento da composição não confere");
  const nodes = new Map(),
    children = new Map();
  for (const node of tree) {
    const id = Number(node.id_ordem),
      parent = Number(node.id_ordem_pai);
    if (!Number.isSafeInteger(id) || id <= 0 || nodes.has(id))
      return fail("Árvore de composição inválida");
    nodes.set(id, node);
    if (id !== parent)
      children.set(parent, [...(children.get(parent) || []), node]);
  }
  if (Array.isArray(raw.itens)) {
    const direct = [...(children.get(Number(root.id_ordem)) || [])];
    for (const component of raw.itens) {
      const index = direct.findIndex(
        (n) => Number(n.id_composto) === Number(component.id_item),
      );
      if (index < 0)
        return fail("Componente da ficha ausente na composição expandida");
      direct.splice(index, 1);
    }
    if (direct.length)
      return fail("Composição expandida diverge dos ingredientes da ficha");
  }
  const visited = new Set(),
    requirements = new Map();
  const factor =
    (Number(outputPerSale) * measure(raw.sg_unidademedida)[1]) /
    (Number(root.qt_utilizada) * measure(root.unidade)[1]);
  function walk(node) {
    const id = Number(node.id_ordem);
    if (visited.has(id)) throw Error("Ciclo na composição");
    visited.add(id);
    const nested = children.get(id) || [];
    if (nested.length) {
      nested.forEach(walk);
      return;
    }
    if (node === root || node.tem_composicao === "S")
      throw Error("Preparo sem composição completa");
    const quantity = finite(node.qt_utilizada),
      itemId = Number(node.id_composto),
      [unit, scale] = measure(node.unidade);
    if (
      quantity === null ||
      quantity < 0 ||
      !Number.isSafeInteger(itemId) ||
      itemId <= 0 ||
      !unit
    )
      throw Error("Quantidade ou unidade inválida na composição");
    if (!quantity) return;
    const key = `${itemId}:${unit}`,
      old = requirements.get(key);
    requirements.set(key, {
      itemId,
      unit,
      name: String(node.desc_item || `Item ${itemId}`),
      quantity: (old?.quantity || 0) + quantity * scale * factor,
    });
  }
  try {
    walk(root);
  } catch (err) {
    return fail(err.message);
  }
  if (visited.size !== nodes.size || !requirements.size)
    return fail("Composição incompleta ou desconectada");
  return { requirements: [...requirements.values()], reason: null };
}
export function computeLedger({
  entries,
  catalog,
  context,
  missingInvoices = 0,
}) {
  const products = new Map(catalog.map((item) => [item.id, item]));
  const rows = new Map(),
    issues = [...context.issues];
  const ensure = (itemId, unit, name, category = "Sem categoria") => {
    const key = `${itemId}:${unit}`;
    if (!rows.has(key))
      rows.set(key, {
        itemId,
        unit,
        name,
        category,
        received: 0,
        consumed: 0,
        balance: 0,
      });
    return rows.get(key);
  };
  if (missingInvoices)
    issues.push(`${missingInvoices} nota(s) sem itens; entradas incompletas`);
  for (const entry of entries) {
    if (entry.invoice.unitId !== context.unit.id) continue;
    const product = products.get(entry.itemId),
      packaging = product?.packaging || [];
    const stockUnits = packaging.filter((p) => p.stock);
    let quantity = finite(entry.quantity),
      unit = entry.unit;
    // qt_convertido is already in the registered stock unit; do not multiply again.
    if (finite(entry.convertedQuantity) !== null && stockUnits.length === 1) {
      quantity = finite(entry.convertedQuantity);
      unit = stockUnits[0].unit;
    } else {
      const pack = packaging.find((p) => p.id === entry.packagingId);
      if (pack && stockUnits.length === 1 && finite(pack.factor) > 0) {
        quantity = quantity === null ? null : quantity * pack.factor;
        unit = stockUnits[0].unit;
      } else if (
        ![
          "KG",
          "G",
          "GR",
          "L",
          "LT",
          "ML",
          "UN",
          "UNID",
          "UND",
          "UNIDADE",
        ].includes(String(unit).trim().toUpperCase())
      ) {
        issues.push(
          `NF ${entry.invoice.number}: embalagem de ${entry.name} sem conversão`,
        );
        continue;
      }
    }
    if (
      !(Number(entry.itemId) > 0) ||
      quantity === null ||
      quantity < 0 ||
      !unit
    ) {
      issues.push(
        `NF ${entry.invoice.number}: quantidade inválida de ${entry.name}`,
      );
      continue;
    }
    const [base, scale] = measure(unit);
    ensure(
      entry.itemId,
      base,
      entry.name,
      product?.category || entry.category,
    ).received += quantity * scale;
  }
  for (const dish of context.dishes) {
    for (const ingredient of dish.requirements) {
      const product = products.get(ingredient.itemId);
      ensure(
        ingredient.itemId,
        ingredient.unit,
        ingredient.name,
        product?.category,
      ).consumed += ingredient.quantity * dish.sold;
    }
  }
  for (const row of rows.values()) row.balance = row.received - row.consumed;
  // Same item in incompatible units must never produce a positive availability claim.
  const unitsByItem = new Map();
  for (const row of rows.values())
    unitsByItem.set(
      row.itemId,
      new Set([...(unitsByItem.get(row.itemId) || []), row.unit]),
    );
  for (const [id, units] of unitsByItem)
    if (units.size > 1)
      issues.push(
        `Item ${id}: unidades incompatíveis (${[...units].join(", ")})`,
      );
  const complete = !issues.length && !context.pending.length;
  const dishes = context.dishes.map((dish) => {
    const ingredients = dish.requirements.map((ingredient) => ({
      ...ingredient,
      balance:
        rows.get(`${ingredient.itemId}:${ingredient.unit}`)?.balance || 0,
    }));
    const incompatible = ingredients.some(
      (i) => unitsByItem.get(i.itemId)?.size > 1,
    );
    const portions =
      ingredients.length && !dish.reason && !incompatible
        ? Math.max(
            0,
            Math.floor(
              Math.min(...ingredients.map((i) => i.balance / i.quantity)) +
                1e-8,
            ),
          )
        : null;
    const limiting =
      portions === null
        ? []
        : ingredients.filter(
            (i) => Math.floor(i.balance / i.quantity + 1e-8) <= portions,
          );
    return {
      ...dish,
      portions,
      limiting,
      status:
        portions === null
          ? "pending"
          : portions === 0
            ? "unavailable"
            : complete
              ? "available"
              : "estimated",
    };
  });
  return {
    rows: [...rows.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    ),
    dishes,
    issues: [...new Set(issues)],
    complete,
  };
}
