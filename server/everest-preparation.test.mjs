import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparationHandler,
  validateContent,
} from "./everest-preparation.mjs";
const path = "1/12/11111111-1111-4111-8111-111111111111.jpg";
const content = {
  steps: [{ title: "Misturar", text: "Misture.", photos: [path] }],
  finalPhoto: null,
};
function fakeDb({ member = true, saved = [], row = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          calls.push([table, k, v]);
          return q;
        },
        maybeSingle() {
          return Promise.resolve({
            data:
              table === "receita_everest_unidade"
                ? { snapshot_id: "current" }
                : table === "receita_everest_snapshot"
                  ? member
                    ? { id: 12 }
                    : null
                  : row,
          });
        },
      };
      return q;
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: saved };
    },
    storage: {
      from() {
        return {
          createSignedUrls: async (paths) => ({
            data: paths.map((p) => ({
              path: p,
              signedUrl: "https://private.test/" + p,
            })),
          }),
          createSignedUploadUrl: async (p) => ({
            data: { token: "private-token", path: p },
          }),
        };
      },
    },
  };
}
async function invoke(
  db,
  { method = "GET", body, access = { user: { id: "owner" } } } = {},
) {
  let result;
  const h = createPreparationHandler({
    getDb: () => db,
    authorize: async () => access,
  });
  await h(
    { method, body, url: "/api/everest-preparation?unit=1&id=12" },
    {
      setHeader() {},
      status(s) {
        this.s = s;
        return this;
      },
      json(data) {
        result = { status: this.s, data };
      },
    },
  );
  return result;
}
test("preparo rejeita fotos de outra unidade e ficha, traversal e etapas inválidas", () => {
  assert.deepEqual(validateContent(content, 1, 12), content);
  for (const p of [
    "3/12/" + path.split("/")[2],
    "1/13/" + path.split("/")[2],
    "1/12/../photo.jpg",
    "https://external/image.jpg",
    null,
  ])
    assert.equal(
      validateContent(
        { ...content, steps: [{ ...content.steps[0], photos: [p] }] },
        1,
        12,
      ),
      null,
    );
  assert.equal(
    validateContent(
      { ...content, steps: [{ title: "", text: " ", photos: [] }] },
      1,
      12,
    ),
    null,
  );
  assert.equal(
    validateContent(
      { ...content, steps: Array(25).fill(content.steps[0]) },
      1,
      12,
    ),
    null,
  );
});
test("autorização precede qualquer acesso e ficha deve pertencer ao snapshot atual da unidade", async () => {
  const db = fakeDb();
  assert.equal(
    (await invoke(db, { access: { status: 403, error: "Sem acesso" } })).status,
    403,
  );
  assert.equal(db.calls.length, 0);
  assert.equal(
    (
      await invoke(fakeDb({ member: false }), {
        method: "POST",
        body: { action: "upload" },
      })
    ).status,
    404,
  );
});
test("preparo lê conteúdo independente do snapshot e fotos privadas assinadas", async () => {
  const db = fakeDb({ row: { content, revision: "r1", updated_at: "now" } });
  const r = await invoke(db);
  assert.equal(r.status, 200);
  assert.equal(r.data.photos[path], "https://private.test/" + path);
  assert.equal(r.data.revision, "r1");
  assert.ok(
    !db.calls.some(
      (c) => c[0] === "receita_everest_preparo" && c[1] === "snapshot_id",
    ),
  );
});
test("salvamento com revisão desatualizada retorna conflito sem sobrescrita", async () => {
  const db = fakeDb();
  const r = await invoke(db, {
    method: "PUT",
    body: { content, revision: null },
  });
  assert.equal(r.status, 409);
  const call = db.calls.find((c) => c[0] === "receita_everest_save_preparo");
  assert.equal(call[1].p_user, "owner");
  assert.equal(call[1].p_unit, 1);
  assert.equal(call[1].p_ficha, 12);
});
test("salva somente conteúdo validado e upload usa caminho gerado pelo servidor", async () => {
  const db = fakeDb({ saved: [{ content, revision: "new" }] });
  const r = await invoke(db, {
    method: "PUT",
    body: { content: { ...content, totalCost: 999 }, revision: null },
  });
  assert.equal(r.status, 200);
  assert.equal(
    db.calls.find((c) => c[0] === "receita_everest_save_preparo")[1].p_content
      .totalCost,
    undefined,
  );
  const upload = await invoke(db, {
    method: "POST",
    body: { action: "upload", path: "another-unit" },
  });
  assert.equal(upload.status, 200);
  assert.match(upload.data.path, /^1\/12\/[a-f0-9-]+\.jpg$/);
  assert.equal(upload.data.token, "private-token");
});
