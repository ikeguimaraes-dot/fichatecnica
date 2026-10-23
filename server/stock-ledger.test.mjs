import test from "node:test";
import assert from "node:assert/strict";
import { recipeRequirements, computeLedger } from "../shared/stock-ledger.mjs";
import {
  assembleContext,
  createStockContextHandler,
} from "./stock-context.mjs";
const raw = {
  id_fichatecnica: 1,
  id_item: 100,
  qt_producao: 10,
  sg_unidademedida: "UNID",
  at_situacao: 1,
  ds_item: "Prato",
  itens: [{ id_item: 200 }],
};
const tree = [
  {
    id_ficha: "1",
    id_composto: 100,
    id_ordem: 1,
    id_ordem_pai: 1,
    qt_producao: 10,
    qt_utilizada: 10,
    unidade: "UNID",
    tem_composicao: "S",
  },
  {
    id_composto: 200,
    id_ordem: 2,
    id_ordem_pai: 1,
    qt_utilizada: 2,
    unidade: "KG",
    tem_composicao: "S",
  },
  {
    id_composto: 300,
    id_ordem: 3,
    id_ordem_pai: 2,
    qt_utilizada: 4,
    unidade: "KG",
    desc_item: "Farinha",
  },
  {
    id_composto: 300,
    id_ordem: 4,
    id_ordem_pai: 2,
    qt_utilizada: 1,
    unidade: "KG",
    desc_item: "Farinha",
  },
];
const dish = {
  id: "a",
  recipeId: 1,
  name: "Prato",
  sold: 4,
  ...recipeRequirements(raw, tree, 1),
};
const context = { unit: { id: 1 }, issues: [], pending: [], dishes: [dish] };
const entries = [
  {
    itemId: 300,
    quantity: 3,
    unit: "KG",
    name: "Farinha",
    invoice: { unitId: 1, number: "12" },
  },
];
test("yield scales nested preparations and sums repeated leaves once", () => {
  const result = recipeRequirements(raw, tree, 1);
  assert.equal(result.reason, null);
  assert.deepEqual(result.requirements, [
    { itemId: 300, name: "Farinha", unit: "KG", quantity: 0.5 },
  ]);
  assert.equal(
    recipeRequirements(raw, tree, 0.5).requirements[0].quantity,
    0.25,
  );
});
test("missing component, cycle, disconnected tree and missing yield stay pending", () => {
  assert.ok(recipeRequirements({ ...raw, qt_producao: 0 }, tree, 1).reason);
  assert.ok(recipeRequirements(raw, tree, null).reason);
  assert.ok(recipeRequirements(raw, tree.slice(0, 2), 1).reason);
  assert.ok(
    recipeRequirements({ ...raw, itens: [{ id_item: 999 }] }, tree, 1).reason,
  );
  assert.ok(
    recipeRequirements(raw, [...tree, { id_ordem: 99, id_ordem_pai: 98 }], 1)
      .reason,
  );
});
test("opening zero, sales consumption, negative balances and independent restaurants", () => {
  let result = computeLedger({
    entries: [
      ...entries,
      { ...entries[0], quantity: 100, invoice: { unitId: 3, number: "13" } },
    ],
    catalog: [],
    context,
  });
  assert.equal(result.rows[0].received, 3);
  assert.equal(result.rows[0].consumed, 2);
  assert.equal(result.dishes[0].portions, 2);
  result = computeLedger({ entries: [], catalog: [], context });
  assert.equal(result.rows[0].balance, -2);
  assert.equal(result.dishes[0].portions, 0);
});
test("package conversion and converted quantities are not multiplied twice", () => {
  const catalog = [
    {
      id: 300,
      category: "Farinhas",
      packaging: [
        { id: 1, unit: "KG", factor: 1, stock: true },
        { id: 2, unit: "CX", factor: 5, stock: false },
      ],
    },
  ];
  const entry = { ...entries[0], quantity: 2, packagingId: 2, unit: "CX" };
  assert.equal(
    computeLedger({ entries: [entry], catalog, context }).rows[0].received,
    10,
  );
  assert.equal(
    computeLedger({
      entries: [{ ...entry, convertedQuantity: 10 }],
      catalog,
      context,
    }).rows[0].received,
    10,
  );
});
test("incompatible units and unresolved sales never claim confirmed availability", () => {
  let result = computeLedger({
    entries: [{ ...entries[0], unit: "L" }],
    catalog: [],
    context,
  });
  assert.equal(result.dishes[0].portions, null);
  assert.equal(result.complete, false);
  result = computeLedger({
    entries,
    catalog: [],
    context: { ...context, pending: [{ name: "Sem ficha" }] },
  });
  assert.equal(result.dishes[0].status, "estimated");
  assert.equal(result.complete, false);
});
test("daily sales recalculate idempotently; mappings and missing days are explicit", () => {
  const input = {
    unit: { id: 1, name: "Meet" },
    workdays: [{ id: "w", data: "2026-10-20" }],
    sales: [
      { id: 1, workday_id_fk: "w", produto: "Prato", qtd: 4 },
      { id: 2, workday_id_fk: "w", produto: "Sem ficha", qtd: 2 },
    ],
    snapshots: [{ id: 1, raw_ficha: raw, raw_cost: tree }],
    mappings: [{ nome_venda: "PRATO", status: "confirmado", ficha_id: "old" }],
    recipeIds: [{ id: "old", everest_id_fichatecnica: 1 }],
    links: [],
    end: "2026-10-21",
  };
  const a = assembleContext(input),
    b = assembleContext(input);
  assert.deepEqual(a, b);
  assert.equal(a.pending.length, 1);
  assert.equal(a.dishes[0].sold, 4);
  assert.equal(a.issues.length, 1);
  const ledger = computeLedger({ entries, catalog: [], context: a });
  assert.equal(ledger.rows[0].consumed, 2);
  const fixed = assembleContext({
    ...input,
    links: [{ sale_name: "SEM FICHA", recipe_id: 1, output_per_sale: 1 }],
  });
  assert.equal(fixed.pending.length, 0);
  assert.equal(
    computeLedger({ entries, catalog: [], context: fixed }).rows[0].consumed,
    3,
  );
});
test("suspect sales and negative quantities remain pending instead of reducing consumption", () => {
  const result = assembleContext({
    unit: { id: 1 },
    workdays: [{ id: "w", data: "2026-10-20", qualidade_suspeito: true }],
    sales: [{ id: 1, workday_id_fk: "w", produto: "Prato", qtd: -1 }],
    snapshots: [{ id: 1, raw_ficha: raw, raw_cost: tree }],
    mappings: [],
    recipeIds: [],
    links: [{ sale_name: "PRATO", recipe_id: 1, output_per_sale: 1 }],
    end: "2026-10-20",
  });
  assert.equal(result.pending.length, 1);
  assert.deepEqual(result.dishes[0].requirements, []);
});
test("unauthorized context writes never access the database", async () => {
  let touched = false;
  const handler = createStockContextHandler({
    authorize: async () => ({ status: 403, error: "Acesso negado" }),
    makeDb: () => {
      touched = true;
    },
  });
  const res = { setHeader() {}, end() {} };
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(touched, false);
});
