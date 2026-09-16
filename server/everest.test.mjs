import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, createUpstream, normalizeFicha } from "./everest.mjs";
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
  assert.deepEqual(passed, { page: 1, id: undefined, refresh: false });
  assert.equal(r.headers["Cache-Control"], "private, no-store");
  for (const url of [
    "/api/everest?id=../secrets",
    "/api/everest?page=0",
    "/api/everest?page=101",
    "/api/everest?url=https://evil.example",
    "/api/everest?entity=other",
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
