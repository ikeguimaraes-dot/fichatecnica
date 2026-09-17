import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotHandler } from "./everest-snapshot-api.mjs";
import { createSource, runWorker, syncStep } from "./everest-sync.mjs";
import { authorized } from "./everest-store.mjs";
function fakeDb(tables = {}, rpc = async () => ({ data: null, error: null })) {
  return {
    rpc,
    from(table) {
      const filters = [];
      let begin = 0,
        end = Infinity,
        single = false,
        orderKey = null,
        ascending = true;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        order(k, o = {}) {
          orderKey = k;
          ascending = o.ascending !== false;
          return q;
        },
        limit(n) {
          end = n - 1;
          return q;
        },
        range(a, b) {
          begin = a;
          end = b;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(resolve, reject) {
          let data = (tables[table] || []).filter((r) =>
            filters.every((f) => f(r)),
          );
          if (orderKey)
            data.sort(
              (a, b) =>
                (a[orderKey] > b[orderKey] ? 1 : -1) * (ascending ? 1 : -1),
            );
          data = data.slice(begin, end + 1);
          return Promise.resolve({
            data: single ? data[0] || null : data,
            error: null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
async function invoke(
  handler,
  { method = "GET", url = "/api/everest?kind=units", body } = {},
) {
  const headers = {};
  let result;
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    status(status) {
      this.code = status;
      return this;
    },
    json(data) {
      result = { status: this.code, data, headers };
      return result;
    },
  };
  await handler({ method, url, body, headers: {} }, res);
  return result;
}
const unit = {
  id: 1,
  name: "Meet",
  enabled: true,
  snapshot_id: "new",
  previous_snapshot_id: "old",
  synced_at: "2026-09-16",
  environment: "production",
  recipe_count: 2,
};
const access = async () => ({ user: { id: "owner" } });
test("GET lê somente snapshot ativo e nunca expõe dados brutos", async () => {
  const rows = [
    {
      snapshot_id: "new",
      unit_id: 1,
      id: 1,
      summary: { id: 1, name: "Atual" },
    },
    {
      snapshot_id: "old",
      unit_id: 1,
      id: 2,
      summary: { id: 2, name: "Removida" },
    },
    {
      snapshot_id: "staging",
      unit_id: 1,
      id: 3,
      summary: { id: 3, name: "Incompleta" },
    },
  ];
  const db = fakeDb({
    receita_everest_unidade: [unit],
    receita_everest_snapshot: rows,
  });
  const r = await invoke(
    createSnapshotHandler({ getDb: () => db, authorize: access }),
    { url: "/api/everest?kind=book&unit=1" },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.records, [{ id: 1, name: "Atual" }]);
  assert.equal(r.data.snapshotId, "new");
  assert.equal(r.headers["Cache-Control"], "private, no-store");
});
test("livro grande não é truncado pelo limite de retorno do banco", async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => ({
    snapshot_id: "new",
    unit_id: 1,
    id: i + 1,
    summary: { id: i + 1 },
  }));
  const db = fakeDb({
    receita_everest_unidade: [unit],
    receita_everest_snapshot: rows,
  });
  const r = await invoke(
    createSnapshotHandler({ getDb: () => db, authorize: access }),
    { url: "/api/everest?kind=book&unit=1" },
  );
  assert.equal(r.data.records.length, 1201);
});
test("snapshot em construção não pode ser solicitado por ID", async () => {
  const db = fakeDb({ receita_everest_unidade: [unit] });
  const handler = createSnapshotHandler({ getDb: () => db, authorize: access });
  assert.equal(
    (
      await invoke(handler, {
        url: "/api/everest?id=1&unit=1&snapshot=staging",
      })
    ).status,
    409,
  );
  assert.equal(
    (await invoke(handler, { url: "/api/everest?id=1&unit=1&unit=3" })).status,
    400,
  );
});
test("POST autorizado inicia job e não permite unidade arbitrária nem alteração de dados", async () => {
  const calls = [];
  const db = fakeDb({ receita_everest_unidade: [unit] }, async (name, args) => {
    calls.push({ name, args });
    return { data: { id: "job", status: "queued" }, error: null };
  });
  const handler = createSnapshotHandler({ getDb: () => db, authorize: access });
  assert.equal(
    (await invoke(handler, { method: "POST", body: { unitId: 1 } })).status,
    202,
  );
  assert.deepEqual(calls[0], {
    name: "receita_everest_start",
    args: { p_user: "owner", p_unit: 1 },
  });
  assert.equal(
    (await invoke(handler, { method: "POST", body: { unitId: 999 } })).status,
    404,
  );
  assert.equal(
    (await invoke(handler, { method: "POST", body: { unitId: 1, price: 2 } }))
      .status,
    400,
  );
});
test("sem autorização não consulta banco nem inicia job", async () => {
  for (const method of ["GET", "POST"]) {
    const handler = createSnapshotHandler({
      getDb: () => {
        throw Error("must not access");
      },
      authorize: async () => ({ status: 403, error: "Negado" }),
    });
    assert.equal(
      (await invoke(handler, { method, body: { unitId: null } })).status,
      403,
    );
  }
});
test("autoriza somente sessão verificada e usuário permitido", async () => {
  const env = { EVEREST_ALLOWED_USER_IDS: "owner" };
  const req = { headers: { authorization: "Bearer token" } };
  assert.equal((await authorized({ headers: {} }, env)).status, 401);
  assert.equal(
    (await authorized(req, env, async () => Response.json({ id: "stranger" })))
      .status,
    403,
  );
  assert.equal(
    (
      await authorized(req, env, async () =>
        Response.json({ id: "owner", is_anonymous: true }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await authorized(req, env, async () => Response.json({ id: "owner" })))
      .user.id,
    "owner",
  );
});
test("worker ocioso não consulta Everest; falha preserva estado sem publicar", async () => {
  let calls = 0;
  const idle = fakeDb({}, async () => ({ data: null, error: null }));
  await runWorker({
    db: idle,
    source: async () => {
      calls++;
    },
  });
  assert.equal(calls, 0);
  const log = [];
  const job = {
    id: "job",
    lease_token: "lease",
    state: {
      phase: "members",
      page: 3,
      members: [1],
      unitIndex: 0,
      targets: [{ id: 1, name: "Meet" }],
    },
  };
  const db = fakeDb({}, async (name, args) => {
    log.push({ name, args });
    return {
      data: name === "receita_everest_claim" ? structuredClone(job) : true,
      error: null,
    };
  });
  const result = await runWorker({
    db,
    source: async () => {
      throw Error("private API response");
    },
  });
  assert.equal(result.retry, true);
  assert.deepEqual(
    log.map((x) => x.name),
    ["receita_everest_claim", "receita_everest_failure"],
  );
  assert.ok(!JSON.stringify(log).includes("private API response"));
  assert.equal(job.state.page, 3);
});
test("checkpoint preserva página concluída para próxima execução", async () => {
  const log = [];
  let clock = 0;
  const job = {
    id: "job",
    lease_token: "lease",
    state: {
      phase: "members",
      page: 1,
      members: [],
      unitIndex: 0,
      targets: [{ id: 1, name: "Meet" }],
    },
  };
  const db = fakeDb({}, async (name, args) => {
    log.push({ name, args });
    return { data: name === "receita_everest_claim" ? job : true, error: null };
  });
  await runWorker({
    db,
    source: async () => ({ rows: [{ id_item: 7, cd_empresa: 1 }], total: 2 }),
    now: () => clock++ * 100,
    budgetMs: 150,
  });
  const checkpoint = log.find((x) => x.name === "receita_everest_checkpoint");
  assert.equal(checkpoint.args.p_state.page, 2);
  assert.deepEqual(checkpoint.args.p_state.members, [7]);
  assert.equal(log.at(-1).args.p_release, true);
});
test("publicação exige RPC atômica e não sobrescreve o livro com update do cliente", async () => {
  const log = [];
  const db = fakeDb({}, async (name, args) => {
    log.push({ name, args });
    return { data: true, error: null };
  });
  const result = await syncStep({
    db,
    source: () => {
      throw Error("no network");
    },
    job: {
      id: "job",
      lease_token: "lease",
      state: {
        phase: "publish",
        unitIndex: 0,
        targets: [{ id: 1, name: "Meet" }],
        expected: 4,
      },
    },
  });
  assert.equal(log[0].name, "receita_everest_publish");
  assert.equal(log[0].args.p_count, 4);
  assert.equal(result.state.phase, "complete");
});
test("fonte confere paginação, unidade e intervalo; não aceita erro como lista vazia", async () => {
  const env = {
    EVEREST_USERNAME: "test",
    EVEREST_PASSWORD: "dummy",
    EVEREST_ENTITY: "2024059",
  };
  const waits = [];
  let count = 0;
  const source = createSource({
    env,
    sleep: async (n) => waits.push(n),
    fetchImpl: async (url) => {
      count++;
      assert.equal(url.searchParams.get("cd_empresa"), "1");
      if (count === 1) return new Response("", { status: 412 });
      return Response.json([{ cd_empresa: 3, id_item: 4 }], {
        headers: { "x-paginas": "1" },
      });
    },
  });
  await assert.rejects(source("members", { unit: 1 }), /source_membership/);
  assert.ok(waits.includes(1800));
  const failed = createSource({
    env,
    sleep: async () => {},
    fetchImpl: async () => new Response("", { status: 500 }),
  });
  await assert.rejects(
    failed("costs", { unit: 1, item: 1 }),
    /source_unavailable/,
  );
});

test("HTTP 200 com objeto vazio é ausência de custos, nunca ausência de cadastros ou erro HTTP", async () => {
  const env = {
    EVEREST_USERNAME: "test",
    EVEREST_PASSWORD: "test",
    EVEREST_ENTITY: "2024059",
  };
  const source = createSource({
    env,
    sleep: async () => {},
    fetchImpl: async () => Response.json({}),
  });
  assert.deepEqual(await source("costs", { unit: 7, item: 3851 }), {
    rows: [],
  });
  await assert.rejects(() => source("recipes"), /source_shape/);
  for (const payload of [null, { error: "failure" }, "invalid"]) {
    const invalid = createSource({
      env,
      sleep: async () => {},
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(
      () => invalid("costs", { unit: 7, item: 3851 }),
      /source_shape/,
    );
  }
  const forbidden = createSource({
    env,
    sleep: async () => {},
    fetchImpl: async () => Response.json({}, { status: 403 }),
  });
  await assert.rejects(
    () => forbidden("costs", { unit: 7, item: 3851 }),
    /source_unavailable/,
  );
});
test("item sem custos mantém valores nulos, registra pendência e avança o checkpoint", async () => {
  const db = fakeDb({
    receita_everest_snapshot: [
      {
        snapshot_id: "job",
        unit_id: 7,
        item_id: 3851,
        id: 1672,
        raw_ficha: {
          id_fichatecnica: 1672,
          id_item: 3851,
          qt_producao: 1,
          sg_unidademedida: "KG",
          itens: [],
        },
      },
    ],
  });
  const original = db.from;
  const writes = [];
  db.from = (table) => {
    const q = original(table);
    q.upsert = async (rows) => {
      writes.push(...rows);
      return { data: null, error: null };
    };
    return q;
  };
  const result = await syncStep({
    db,
    source: async () => ({ rows: [] }),
    job: {
      id: "job",
      state: {
        phase: "costs",
        targets: [{ id: 7, name: "HOS" }],
        unitIndex: 0,
        items: [3851, 3852],
        itemIndex: 0,
      },
    },
  });
  assert.equal(result.state.itemIndex, 1);
  assert.equal(result.state.phase, "costs");
  assert.deepEqual(result.state.costWarnings, [{ unit: 7, item: 3851 }]);
  assert.equal(writes[0].checked, true);
  assert.equal(writes[0].detail.totalCost, null);
  assert.equal(writes[0].detail.costStatus, "unavailable");
  assert.deepEqual(writes[0].raw_cost, []);
});
