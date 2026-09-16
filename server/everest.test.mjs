import test from "node:test";
import assert from "node:assert/strict";
import {
  attachCosts,
  createHandler,
  createUpstream,
  normalizeFicha,
} from "./everest.mjs";
const raw = {
  id_fichatecnica: 12,
  id_item: 23,
  cd_item: "500001",
  ds_item: "Massa",
  sg_unidademedida: "KG",
  qt_producao: 0.5,
  nr_versao: 2,
  at_situacao: 1,
  itens: [
    {
      id_item: 7,
      ds_item: "Farinha",
      qt_aplicada: 0.25,
      sg_unidademedida: "KG",
      pr_aproveitamento: 100,
    },
  ],
};
const env = {
  EVEREST_USERNAME: "test-user",
  EVEREST_PASSWORD: "test-password",
  EVEREST_ENTITY: "2024059",
  EVEREST_ENVIRONMENT: "production",
  EVEREST_ALLOWED_USER_IDS: "owner",
};
async function invoke(
  handler,
  { method = "GET", url = "/api/everest?page=1", token = "token" } = {},
) {
  const headers = {};
  let body;
  const res = {
    statusCode: 0,
    setHeader: (k, v) => (headers[k] = v),
    end: (v) => (body = JSON.parse(v)),
  };
  await handler(
    { method, url, headers: token ? { authorization: "Bearer " + token } : {} },
    res,
  );
  return { status: res.statusCode, headers, body };
}
test("normalização mantém kg e não converte litros/unidades em kg", () => {
  assert.equal(normalizeFicha(raw).yieldKg, 0.5);
  assert.equal(
    normalizeFicha({ ...raw, sg_unidademedida: "G", qt_producao: 500 }).yieldKg,
    0.5,
  );
  for (const unit of ["UNID", "L"])
    assert.equal(
      normalizeFicha({ ...raw, sg_unidademedida: unit }).yieldKg,
      null,
    );
  const d = normalizeFicha(
    { ...raw, instrucao: "<script>evil</script>" },
    true,
  );
  assert.equal(d.components[0].quantity, 0.25);
  assert.equal(d.instructions, "<script>evil</script>");
  assert.equal(d.components[0].cost, undefined);
});
test("exige login e não aceita escrita", async () => {
  let calls = 0;
  const handler = createHandler({
    env,
    fetchImpl: async () => {
      calls++;
      throw Error("unexpected");
    },
    upstream: async () => {
      throw Error("unexpected");
    },
  });
  assert.equal((await invoke(handler, { token: null })).status, 401);
  assert.equal((await invoke(handler, { method: "POST" })).status, 405);
  assert.equal(calls, 0);
});
test("confere token no Supabase e bloqueia outra conta e login anônimo", async () => {
  for (const user of [
    { id: "stranger" },
    { id: "owner", is_anonymous: true },
  ]) {
    const handler = createHandler({
      env,
      fetchImpl: async () => Response.json(user),
      upstream: async () => {
        throw Error("must not reach Everest");
      },
    });
    assert.equal((await invoke(handler)).status, 403);
  }
  const handler = createHandler({
    env,
    fetchImpl: async () => new Response("", { status: 401 }),
    upstream: async () => null,
  });
  assert.equal((await invoke(handler)).status, 401);
});
test("requisição autorizada, parâmetros restritos e cache privado", async () => {
  let passed;
  const handler = createHandler({
    env,
    fetchImpl: async (url, options) => {
      assert.match(url, /\/auth\/v1\/user$/);
      assert.equal(options.headers.Authorization, "Bearer token");
      return Response.json({ id: "owner" });
    },
    upstream: async (args) => {
      passed = args;
      return { records: [normalizeFicha(raw)], totalPages: 1 };
    },
  });
  const r = await invoke(handler);
  assert.equal(r.status, 200);
  assert.deepEqual(passed, {
    page: 1,
    id: undefined,
    refresh: false,
    kind: "recipes",
    unit: undefined,
  });
  assert.equal(r.headers["Cache-Control"], "private, no-store");
  assert.equal(
    (await invoke(handler, { url: "/api/everest?id=12&unit=3" })).status,
    200,
  );
  assert.equal(passed.unit, 3);
  assert.equal(passed.id, 12);
  for (const url of [
    "/api/everest?id=../secrets",
    "/api/everest?page=0",
    "/api/everest?page=101",
    "/api/everest?url=https://evil.example",
    "/api/everest?entity=other",
    "/api/everest?kind=members",
    "/api/everest?kind=members&unit=../3",
    "/api/everest?kind=units&id=12",
    "/api/everest?kind=unknown",
    "/api/everest?unit=1",
    "/api/everest?id=12&unit=-1",
    "/api/everest?id=12&unit=abc",
  ])
    assert.equal((await invoke(handler, { url })).status, 400);
});
test("Basic auth, entidade e paginação corretas, retry após 412 e cache", async () => {
  const waits = [];
  let calls = 0;
  const upstream = createUpstream({
    env,
    sleep: async (ms) => waits.push(ms),
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.origin, "https://producao.acomsistemas.com.br");
      assert.equal(url.searchParams.get("x-Entidade"), "2024059");
      assert.equal(url.searchParams.get("x-Pagina"), "2");
      assert.equal(
        options.headers.Authorization,
        "Basic " + Buffer.from("test-user:test-password").toString("base64"),
      );
      if (calls === 1) return new Response("rate limit", { status: 412 });
      return Response.json([raw], { headers: { "x-paginas": "5" } });
    },
  });
  const r = await upstream({ page: 2 });
  assert.equal(r.totalPages, 5);
  assert.equal(r.records[0].id, 12);
  assert.equal(calls, 2);
  assert.ok(waits.includes(1200));
  await upstream({ page: 2 });
  assert.equal(calls, 2);
});
test("detalhe usa endpoint por ID, sem parâmetros arbitrários", async () => {
  const upstream = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/api/adm/fichatecnica/12");
      assert.equal(url.searchParams.has("x-Pagina"), false);
      return Response.json(raw);
    },
  });
  const result = await upstream({ id: 12, page: 1 });
  assert.equal(result.record.components.length, 1);
});
test("erros externos não expõem credenciais nem respostas do fornecedor", async () => {
  const handler = createHandler({
    env,
    fetchImpl: async () => Response.json({ id: "owner" }),
    upstream: async () => {
      throw Error("test-password secret provider response");
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result).includes("test-password"));
});

test("unidades expõem somente código e nome; vínculos e cache são separados por empresa", async () => {
  const seen = [];
  const upstream = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async (url) => {
      seen.push(url.toString());
      if (url.pathname === "/api/sis/empresa")
        return Response.json(
          [
            {
              cd_empresa: 3,
              fantasia: "MADONNA",
              senha_esupri: "secret",
              cpf_cnpj: "private",
            },
          ],
          { headers: { "x-paginas": "1" } },
        );
      assert.equal(url.pathname, "/api/adm/itemempresa");
      const unit = Number(url.searchParams.get("cd_empresa"));
      return Response.json(
        [{ cd_empresa: unit, id_item: unit === 3 ? 24 : 23 }],
        { headers: { "x-paginas": "2" } },
      );
    },
  });
  assert.deepEqual((await upstream({ kind: "units", page: 1 })).records, [
    { id: 3, name: "MADONNA" },
  ]);
  assert.deepEqual(
    (await upstream({ kind: "members", unit: 1, page: 1 })).records,
    [{ itemId: 23 }],
  );
  assert.deepEqual(
    (await upstream({ kind: "members", unit: 3, page: 1 })).records,
    [{ itemId: 24 }],
  );
  await upstream({ kind: "members", unit: 1, page: 1 });
  assert.equal(seen.length, 3);
  await upstream({ kind: "members", unit: 1, page: 2 });
  assert.equal(seen.length, 4);
});
test("rejeita vínculos retornados para outra unidade e aceita unidade sem itens", async () => {
  const upstream = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async () =>
      Response.json([{ cd_empresa: 3, id_item: 24 }], {
        headers: { "x-paginas": "1" },
      }),
  });
  await assert.rejects(
    upstream({ kind: "members", unit: 1, page: 1 }),
    /invalid_membership/,
  );
  const empty = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async () => Response.json([], { headers: { "x-paginas": "0" } }),
  });
  const result = await empty({ kind: "members", unit: 1, page: 1 });
  assert.deepEqual(result.records, []);
  assert.equal(result.totalPages, 1);
});

const costTree = [
  {
    id_ordem: 1,
    id_ordem_pai: 1,
    id_composto: 23,
    id_ficha: "12",
    qt_producao: 0.5,
    vl_custo_producao: 5,
  },
  {
    id_ordem: 2,
    id_ordem_pai: 1,
    id_composto: 7,
    unidade: "KG  ",
    qt_aplicada: 0.25,
    custo_medio: 20,
    vl_custo_producao: 5,
  },
  {
    id_ordem: 3,
    id_ordem_pai: 2,
    id_composto: 99,
    unidade: "KG",
    qt_aplicada: 0.1,
    custo_medio: 50,
    vl_custo_producao: 5,
  },
];
test("custos usam somente componentes diretos, total Everest e rendimento kg", () => {
  const result = attachCosts(normalizeFicha(raw, true), costTree);
  assert.equal(result.costStatus, "available");
  assert.equal(result.totalCost, 5);
  assert.equal(result.costPerKg, 10);
  assert.equal(result.components[0].unitCost, 20);
  assert.equal(result.components[0].appliedCost, 5);
  const un = attachCosts(
    normalizeFicha({ ...raw, sg_unidademedida: "UNID" }, true),
    costTree,
  );
  assert.equal(un.costPerKg, null);
  const zero = attachCosts(
    normalizeFicha(raw, true),
    costTree.map((r) => ({ ...r, custo_medio: 0, vl_custo_producao: 0 })),
  );
  assert.equal(zero.costStatus, "available");
  assert.equal(zero.totalCost, 0);
});
test("custos ausentes e versões diferentes não viram zero nem total incorreto", () => {
  const missing = attachCosts(
    normalizeFicha(raw, true),
    costTree.map((r) => ({ ...r, custo_medio: null })),
  );
  assert.equal(missing.costStatus, "partial");
  assert.equal(missing.totalCost, null);
  const mismatch = attachCosts(
    normalizeFicha(raw, true),
    costTree.map((r) => ({ ...r, id_ficha: "99" })),
  );
  assert.equal(mismatch.costStatus, "version_mismatch");
  assert.equal(mismatch.components[0].unitCost, null);
});
test("consulta e cache de custos são separados por unidade", async () => {
  const calls = [];
  const upstream = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async (url) => {
      calls.push(url.toString());
      if (url.pathname === "/api/adm/fichatecnica/12")
        return Response.json(raw);
      assert.equal(url.pathname, "/api/adm/fichatecnica/item/23");
      const unit = Number(url.searchParams.get("cd_empresa"));
      return Response.json(
        costTree.map((r) => ({
          ...r,
          custo_medio: unit * 20,
          vl_custo_producao: unit * 5,
        })),
      );
    },
  });
  assert.equal((await upstream({ id: 12, unit: 1 })).record.totalCost, 5);
  assert.equal((await upstream({ id: 12, unit: 3 })).record.totalCost, 15);
  await upstream({ id: 12, unit: 1 });
  assert.equal(calls.length, 4);
});
test("falha da consulta de custo preserva composição sem inventar preços", async () => {
  const upstream = createUpstream({
    env,
    sleep: async () => {},
    fetchImpl: async (url) =>
      url.pathname.endsWith("/item/23")
        ? new Response("", { status: 500 })
        : Response.json(raw),
  });
  const result = await upstream({ id: 12, unit: 1 });
  assert.equal(result.record.components[0].name, "Farinha");
  assert.equal(result.record.totalCost, null);
  assert.equal(result.record.costStatus, "unavailable");
});
