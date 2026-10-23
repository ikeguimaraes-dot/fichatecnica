import test from "node:test";
import assert from "node:assert/strict";
import { menuCategory, rankSales } from "../shared/stock-menu.mjs";
import { assembleContext } from "./stock-context.mjs";

test("menu categories use product groups and preserve pasta, bread and alcohol-free distinctions", () => {
  for (const [name, expected] of [
    ["Picanha", "Proteínas"],
    ["Negroni", "Alcoólicos"],
    ["Linguiça", "Embutidos"],
    ["Pão de alho", "Pães"],
    ["Ravioli de carne", "Massas"],
    ["Bruschetta de presunto", "Pães"],
    ["Drink sem álcool", "Sem álcool"],
    ["Especial da casa", "Outros"],
  ]) {
    assert.equal(menuCategory({ name }), expected, name);
  }
  assert.equal(
    menuCategory({ name: "Especial", groups: ["Massas Frescas"] }),
    "Massas",
  );
  assert.equal(
    menuCategory({ name: "Especial", groups: ["Drinks S/Alcool"] }),
    "Sem álcool",
  );
  assert.equal(
    menuCategory({ name: "Especial", groups: ["Proteinas"] }),
    "Proteínas",
  );
  assert.equal(
    menuCategory({ name: "Croissant", groups: ["Cafe da Manha"] }),
    "Pães",
  );
  assert.equal(
    menuCategory({ name: "Especial", catalogCategory: "Embutidos" }),
    "Embutidos",
  );
  assert.equal(menuCategory({ name: "Filé ao vinho" }), "Proteínas");
});

test("rankings independently sort descending, number 1–20 and omit unknown or suspect metrics", () => {
  const sales = Array.from({ length: 25 }, (_, i) => ({
    name: `Produto ${i}`,
    quantity: i + 1,
    netValue: 100 - i,
  }));
  const original = structuredClone(sales);
  const qty = rankSales(sales, "quantity"),
    value = rankSales(sales, "value");
  assert.equal(qty.length, 20);
  assert.equal(qty[0].name, "Produto 24");
  assert.equal(qty.at(-1).rank, 20);
  assert.equal(value[0].name, "Produto 0");
  assert.deepEqual(sales, original);
  const incomplete = [
    { name: "B", quantity: 4, netValue: 5 },
    { name: "A", quantity: 4, netValue: null },
    { name: "C", quantity: 100, netValue: 100, suspect: true },
    { name: "D", quantity: 200, netValue: 10, quantityValid: false },
    { name: "E", quantity: 0, netValue: 0 },
  ];
  assert.deepEqual(
    rankSales(incomplete, "quantity").map((s) => s.name),
    ["A", "B"],
  );
  assert.deepEqual(
    rankSales(incomplete, "value").map((s) => s.name),
    ["D", "B"],
  );
});

test("sales aggregate days and names, use gross less discounts without tips, and preserve missing values", () => {
  const context = assembleContext({
    unit: { id: 1 },
    workdays: [
      { id: "a", data: "2026-10-20" },
      { id: "b", data: "2026-10-21" },
    ],
    sales: [
      {
        produto: "Prato",
        workday_id_fk: "a",
        qtd: 2,
        bruto: 100,
        desconto: 10,
        gorjeta: 13,
        total: 103,
        grupo: "Proteinas",
      },
      {
        produto: " PRATO ",
        workday_id_fk: "b",
        qtd: 3,
        bruto: 150,
        desconto: 5,
        gorjeta: 19.5,
        total: 164.5,
        grupo: "Proteinas",
      },
      {
        produto: "Outro",
        workday_id_fk: "a",
        qtd: 1,
        bruto: 50,
        desconto: null,
      },
    ],
    snapshots: [],
    mappings: [],
    links: [],
    recipeIds: [],
    end: "2026-10-21",
  });
  assert.equal(context.sales.length, 2);
  assert.equal(context.sales[0].quantity, 5);
  assert.equal(context.sales[0].netValue, 235);
  assert.deepEqual(context.sales[0].groups, ["Proteinas"]);
  assert.equal(context.sales[1].netValue, null);
});
