import test from "node:test";
import assert from "node:assert/strict";
import { principalProduct } from "./stock-principal.mjs";
import { topCategory, rankSales } from "../shared/stock-menu.mjs";
const raw = {
  id_fichatecnica: 1,
  id_item: 100,
  qt_producao: 1,
  sg_unidademedida: "UN",
  itens: [
    { id_item: 2, ds_item: "Carne", sg_unidademedida: "KG", qt_aplicada: 0.3 },
    {
      id_item: 3,
      ds_item: "Tempero",
      sg_unidademedida: "KG",
      qt_aplicada: 0.01,
    },
  ],
};
const tree = [
  {
    id_ordem: 1,
    id_ordem_pai: 1,
    id_composto: 100,
    id_ficha: 1,
    qt_producao: 1,
    qt_utilizada: 1,
  },
  {
    id_ordem: 2,
    id_ordem_pai: 1,
    id_composto: 2,
    unidade: "KG",
    qt_aplicada: 0.3,
    custo_medio: 40,
    custo_unitario: 12,
  },
  {
    id_ordem: 3,
    id_ordem_pai: 1,
    id_composto: 3,
    unidade: "KG",
    qt_aplicada: 0.01,
    custo_medio: 200,
    custo_unitario: 2,
  },
];
test("principal uses applied recipe cost, not highest price per kg; missing costs cannot elect a winner", () => {
  assert.deepEqual(principalProduct(raw, tree), {
    itemId: 2,
    name: "Carne",
    unit: "KG",
    appliedCost: 12,
    preparation: false,
  });
  assert.equal(
    principalProduct(
      raw,
      tree.map((n) => (n.id_ordem === 3 ? { ...n, custo_unitario: null } : n)),
    ),
    null,
  );
  assert.equal(principalProduct(raw, []), null);
  assert.equal(
    principalProduct(
      raw,
      tree.map((n) => ({ ...n, custo_unitario: 0 })),
    ),
    null,
  );
});
test("nested preparation is valued from leaves and flagged, not assigned raw stock", () => {
  const nested = [
    ...tree,
    {
      id_ordem: 4,
      id_ordem_pai: 2,
      id_composto: 4,
      custo_unitario: 15,
      custo_medio: 20,
    },
  ];
  const principal = principalProduct(raw, nested);
  assert.equal(principal.itemId, 2);
  assert.equal(principal.appliedCost, 15);
  assert.equal(principal.preparation, true);
});
test("top categories preserve entries, dessert wine and non-alcoholic drinks; filtering precedes top20", () => {
  for (const [group, category] of [
    ["Entradas Quente", "Entradas"],
    ["Antipasti", "Entradas"],
    ["Proteinas", "Pratos principais"],
    ["Massas Frescas", "Pratos principais"],
    ["Drinks S/Alcool", "Não alcoólicos"],
    ["Vinho Sobremesa", "Bebidas alcoólicas"],
    ["Dolci", "Sobremesas"],
    ["Convite", "Outros"],
  ]) {
    assert.equal(topCategory({ name: "Especial", groups: [group] }), category);
  }
  const sales = Array.from({ length: 30 }, (_, i) => ({
    name: `Item ${i}`,
    quantity: 30 - i,
    groups: [i < 25 ? "Proteinas" : "Entradas"],
  }));
  const ranked = rankSales(
    sales.filter((s) => topCategory(s) === "Entradas"),
    "quantity",
  );
  assert.equal(ranked.length, 5);
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].name, "Item 25");
});
