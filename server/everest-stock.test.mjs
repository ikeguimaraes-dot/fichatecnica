import test from "node:test";
import assert from "node:assert/strict";
import {
  createStockSource,
  createStockHandler,
  normalizeStock,
  validDate,
} from "./everest-stock.mjs";
const env = {
  EVEREST_ENTITY: "example",
  EVEREST_USERNAME: "user",
  EVEREST_PASSWORD: "secret",
};
test("stock uses inclusive launch-date parameters and preserves pagination", async () => {
  const urls = [];
  const source = createStockSource({
    env,
    sleep: async () => {},
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      return new Response(JSON.stringify([]), {
        headers: { "x-paginas": "2" },
      });
    },
  });
  await source({
    kind: "invoices",
    page: 1,
    start: "2026-10-20",
    end: "2026-10-23",
  });
  const result = await source({
    kind: "items",
    page: 2,
    start: "2026-10-20",
    end: "2026-10-23",
    unit: 3,
  });
  assert.equal(urls[0].pathname, "/api/dfi/notarecebida");
  assert.equal(urls[0].searchParams.get("lancamento_inicial"), "2026-10-20");
  assert.equal(urls[0].searchParams.get("lancamento_final"), "2026-10-23");
  assert.equal(urls[1].searchParams.get("dt_lancamento_ini"), "2026-10-20");
  assert.equal(urls[1].searchParams.get("cd_empresa"), "3");
  assert.equal(result.totalPages, 2);
});
test("missing pagination and upstream errors never become empty stock", async () => {
  for (const response of [
    new Response("[]"),
    new Response("secret upstream details", { status: 500 }),
  ]) {
    const source = createStockSource({
      env,
      sleep: async () => {},
      fetchImpl: async () => response,
    });
    await assert.rejects(source({ kind: "catalog", page: 1 }));
  }
});
test("normalization preserves unknown values and does not expose supplier personal data", () => {
  const row = normalizeStock("invoices", {
    id_notarecebida: 1,
    cd_empresa: 2,
    cpf_cnpj_emitente: "private",
    vl_total: null,
  });
  assert.equal(row.total, null);
  assert.equal("cpf_cnpj_emitente" in row, false);
  assert.equal(
    normalizeStock("catalog", { id_item: 1, ds_grupo: "Hortifruti" }).category,
    "Hortifruti",
  );
  assert.equal(validDate("2026-02-30"), false);
});
test("handler blocks unauthenticated and invalid date requests before calling Everest", async () => {
  let called = false;
  for (const access of [
    { status: 401, error: "Entre na conta" },
    { user: { id: "user" } },
  ]) {
    const handler = createStockHandler({
      authorize: async () => access,
      source: async () => {
        called = true;
      },
    });
    const res = {
      setHeader() {},
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await handler(
      {
        method: "GET",
        url: "/api/everest-stock?start=2026-02-30&end=2026-03-01",
        headers: {},
      },
      res,
    );
    assert.equal(res.statusCode, access.user ? 400 : 401);
  }
  assert.equal(called, false);
});
