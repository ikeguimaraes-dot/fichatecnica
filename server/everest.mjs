const DEFAULT_AUTH_URL = "https://iqgrvptrtphvbmvrqntm.supabase.co";
const DEFAULT_PUBLIC_KEY = "sb_publishable_ZeUC_rH70nELk4No1GnTNg_XBtc_GlD";
const bases = {
  production: "https://producao.acomsistemas.com.br",
  homologation: "https://homologacao.acomsistemas.com.br",
};
const text = (value) => (typeof value === "string" ? value : "");
const number = (value) =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const positiveId = (value) =>
  Number.isSafeInteger(number(value)) && number(value) > 0;
export function normalizeFicha(raw, detail = false) {
  if (!raw || typeof raw !== "object" || !positiveId(raw.id_fichatecnica))
    throw new Error("invalid_record");
  const quantity = number(raw.qt_producao),
    unit = text(raw.sg_unidademedida).trim().toUpperCase();
  const components = Array.isArray(raw.itens) ? raw.itens : [];
  const record = {
    id: Number(raw.id_fichatecnica),
    itemId: number(raw.id_item),
    code: text(raw.cd_item),
    name: text(raw.ds_item) || "Ficha sem descrição",
    unit,
    quantity,
    yieldKg:
      quantity === null
        ? null
        : unit === "KG"
          ? quantity
          : ["G", "GR"].includes(unit)
            ? quantity / 1000
            : null,
    version: number(raw.nr_versao),
    versionDate: text(raw.dt_versao),
    status: number(raw.at_situacao),
    released: raw.fl_liberado_producao === "S",
    componentCount: components.length,
  };
  if (detail)
    Object.assign(record, {
      packaging: text(raw.ds_embalagem),
      instructions: text(raw.instrucao),
      notes: [text(raw.observacao), text(raw.ds_observacao)]
        .filter((v, i, a) => v && a.indexOf(v) === i)
        .join("\n\n"),
      shelfLifeDays: number(raw.dd_validade),
      costStatus: "unavailable",
      totalCost: null,
      costPerKg: null,
      costAudit: null,
      components: components.map((i) => ({
        itemId: number(i.id_item),
        code: text(i.cd_item),
        name: text(i.ds_item) || "Item sem descrição",
        packaging: text(i.ds_embalagem),
        unit: text(i.sg_unidademedida),
        quantity: number(i.qt_aplicada),
        utilization: number(i.pr_aproveitamento),
        type: number(i.at_tipo_componente),
        unitCost: null,
        appliedCost: null,
        stockUnitCost: null,
        costBasis: "unmatched",
      })),
    });
  return record;
}
export function attachCosts(record, raw) {
  if (!Array.isArray(raw)) return record;
  const roots = raw.filter(
    (r) =>
      number(r.id_composto) === record.itemId &&
      positiveId(r.id_ordem) &&
      number(r.id_ordem) === number(r.id_ordem_pai),
  );
  if (roots.length !== 1) return record;
  const root = roots[0];
  if (
    number(root.id_ficha) !== record.id ||
    number(root.qt_producao) !== record.quantity
  )
    return { ...record, costStatus: "version_mismatch" };
  const movement = number(root.qt_utilizada);
  if (!(movement > 0) || !(record.quantity > 0)) return record;
  const scale = record.quantity / movement;
  const nodes = new Map(),
    branches = new Map();
  for (const node of raw) {
    const id = number(node.id_ordem),
      parent = number(node.id_ordem_pai);
    if (!positiveId(id) || !positiveId(parent) || nodes.has(id)) return record;
    nodes.set(id, node);
    if (id !== parent)
      branches.set(parent, [...(branches.get(parent) || []), node]);
  }
  const reached = new Set(),
    zeroCosts = new Set(),
    missingCosts = new Set(),
    stocklessCosts = new Set();
  function sumBranch(node, path = new Set()) {
    const id = number(node.id_ordem);
    const name = text(node.desc_item) || `Item ${node.id_composto}`;
    if (path.has(id) || path.size > 100) {
      missingCosts.add(name);
      return null;
    }
    reached.add(id);
    const children = branches.get(id) || [];
    if (children.length) {
      const next = new Set(path);
      next.add(id);
      const values = children.map((child) => sumBranch(child, next));
      return values.some((v) => v === null)
        ? null
        : values.reduce((a, b) => a + b, 0);
    }
    // A declared preparation without its ingredients cannot be priced as a raw ingredient.
    const contribution = number(node.custo_unitario);
    if (
      node.tem_composicao === "S" ||
      contribution === null ||
      contribution < 0
    ) {
      missingCosts.add(name);
      return null;
    }
    if (contribution === 0 && number(node.qt_utilizada) > 0)
      zeroCosts.add(name);
    if (contribution > 0 && !(number(node.custo_medio) > 0))
      stocklessCosts.add(name);
    return contribution * scale;
  }
  const children = branches.get(number(root.id_ordem)) || [];
  const used = new Set();
  const components = record.components.map((component) => {
    const index = children.findIndex(
      (row, i) =>
        !used.has(i) &&
        number(row.id_composto) === component.itemId &&
        text(row.unidade).trim().toUpperCase() ===
          component.unit.trim().toUpperCase() &&
        number(row.qt_aplicada) !== null &&
        component.quantity !== null &&
        Math.abs(Number(row.qt_aplicada) - component.quantity) < 0.000001,
    );
    if (index < 0) {
      missingCosts.add(component.name);
      return component;
    }
    used.add(index);
    const row = children[index];
    const appliedCost = sumBranch(row);
    const unitCost =
      appliedCost !== null && component.quantity > 0
        ? appliedCost / component.quantity
        : null;
    return {
      ...component,
      unitCost,
      appliedCost,
      stockUnitCost: number(row.custo_medio),
      costBasis: branches.has(number(row.id_ordem)) ? "composition" : "everest",
    };
  });
  const complete =
    components.length > 0 &&
    used.size === children.length &&
    reached.size === nodes.size - 1 &&
    components.every((c) => c.unitCost !== null && c.appliedCost !== null);
  const totalCost = complete
    ? components.reduce((sum, c) => sum + c.appliedCost, 0)
    : null;
  const sourceTotal = number(root.vl_custo_producao);
  return {
    ...record,
    components,
    totalCost,
    costStatus: !complete
      ? "partial"
      : zeroCosts.size || stocklessCosts.size
        ? "review"
        : "available",
    costPerKg:
      totalCost !== null && record.yieldKg > 0
        ? totalCost / record.yieldKg
        : null,
    costAudit: {
      sourceTotal,
      difference:
        totalCost !== null && sourceTotal !== null
          ? totalCost - sourceTotal
          : null,
      zeroCostItems: [...zeroCosts],
      missingCostItems: [...missingCosts],
      stocklessCostItems: [...stocklessCosts],
    },
  };
}
export function createUpstream({
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const cache = new Map();
  let queue = Promise.resolve(),
    lastStart = 0;
  return function read({ page, id, kind = "recipes", unit, refresh = false }) {
    const environment = env.EVEREST_ENVIRONMENT || "production";
    const base = bases[environment];
    const entity = env.EVEREST_ENTITY;
    if (!base || !entity || !env.EVEREST_USERNAME || !env.EVEREST_PASSWORD)
      throw new Error("configuration");
    const path =
      kind === "units"
        ? "/api/sis/empresa"
        : kind === "members"
          ? "/api/adm/itemempresa"
          : "/api/adm/fichatecnica" + (id ? "/" + id : "");
    const url = new URL(path, base);
    if (kind === "members") url.searchParams.set("cd_empresa", String(unit));
    url.searchParams.set("x-Entidade", entity);
    if (!id) url.searchParams.set("x-Pagina", String(page));
    const key = url.toString() + (id ? `#unit=${unit || "none"}` : ""),
      existing = cache.get(key);
    if (!refresh && existing && existing.expires > Date.now())
      return Promise.resolve(existing.value);
    const task = queue.then(async () => {
      // Serializes requests in each warm instance. A 412 from another instance is retried once.
      async function readJson(target) {
        let response;
        for (let attempt = 0; attempt < 2; attempt++) {
          await sleep(Math.max(0, 1100 - (Date.now() - lastStart)));
          lastStart = Date.now();
          response = await fetchImpl(target, {
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(
                  `${env.EVEREST_USERNAME}:${env.EVEREST_PASSWORD}`,
                ).toString("base64"),
              Accept: "application/json",
            },
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          });
          if (![412, 429].includes(response.status) || attempt === 1) break;
          await response.text();
          await sleep(1200);
        }
        if (response.status === 404) throw new Error("not_found");
        if ([412, 429].includes(response.status)) throw new Error("rate_limit");
        if (!response.ok) throw new Error("upstream");
        return {
          raw: await response.json(),
          pagination: response.headers.get("x-paginas"),
        };
      }
      const { raw, pagination } = await readJson(url);
      let result;
      if (id) {
        const item = Array.isArray(raw)
          ? raw.find((r) => Number(r.id_fichatecnica) === id)
          : raw;
        if (!item) throw new Error("not_found");
        result = { record: normalizeFicha(item, true) };
        if (result.record.id !== id) throw new Error("upstream");
        if (unit && result.record.itemId) {
          const costUrl = new URL(
            `/api/adm/fichatecnica/item/${result.record.itemId}`,
            base,
          );
          costUrl.searchParams.set("x-Entidade", entity);
          costUrl.searchParams.set("cd_empresa", String(unit));
          try {
            result.record = attachCosts(
              result.record,
              (await readJson(costUrl)).raw,
            );
          } catch {
            /* Composition remains available if the cost service fails. */
          }
        }
      } else {
        if (!Array.isArray(raw)) throw new Error("invalid_response");
        const totalPages =
          pagination === "0" && raw.length === 0 ? 1 : Number(pagination);
        if (
          !Number.isSafeInteger(totalPages) ||
          totalPages < 1 ||
          totalPages > 100
        )
          throw new Error("invalid_pagination");
        result = {
          records: raw.map((r) => {
            if (kind === "units") {
              if (!positiveId(r.cd_empresa)) throw new Error("invalid_unit");
              return {
                id: Number(r.cd_empresa),
                name:
                  text(r.fantasia).trim() ||
                  text(r.razao).trim() ||
                  `Unidade ${r.cd_empresa}`,
              };
            }
            if (kind === "members") {
              if (Number(r.cd_empresa) !== unit || !positiveId(r.id_item))
                throw new Error("invalid_membership");
              return { itemId: Number(r.id_item) };
            }
            return normalizeFicha(r);
          }),
          page,
          totalPages,
        };
      }
      const value = {
        ...result,
        environment,
        fetchedAt: new Date().toISOString(),
      };
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { expires: Date.now() + 300000, value });
      return value;
    });
    queue = task.catch(() => {});
    return task;
  };
}
export function createHandler({
  env = process.env,
  fetchImpl = fetch,
  upstream = createUpstream({ env, fetchImpl }),
} = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return send(405, { error: "Método não permitido." });
    }
    const authorization = req.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !/^Bearer [A-Za-z0-9._-]+$/.test(authorization)
    )
      return send(401, {
        error: "Entre na sua conta para consultar as fichas técnicas.",
      });
    const allowed = (env.EVEREST_ALLOWED_USER_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!allowed.length)
      return send(503, {
        error: "A integração está aguardando configuração de acesso.",
      });
    try {
      const auth = await fetchImpl(
        `${env.SUPABASE_URL || DEFAULT_AUTH_URL}/auth/v1/user`,
        {
          headers: {
            Authorization: authorization,
            apikey: env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLIC_KEY,
          },
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!auth.ok)
        return send(auth.status >= 500 ? 503 : 401, {
          error:
            auth.status >= 500
              ? "Não foi possível verificar seu acesso. Tente novamente."
              : "Sua sessão expirou. Entre novamente.",
        });
      const user = await auth.json();
      if (!user.id || user.is_anonymous || !allowed.includes(user.id))
        return send(403, {
          error:
            "Sua conta não tem acesso às fichas do Everest. Solicite a liberação ao administrador.",
        });
      const url = new URL(req.url, "http://localhost");
      if (
        [...url.searchParams.keys()].some(
          (k) => !["page", "id", "refresh", "kind", "unit"].includes(k),
        )
      )
        return send(400, { error: "Parâmetros de consulta inválidos." });
      const kind = url.searchParams.get("kind") || "recipes";
      const unitText = url.searchParams.get("unit");
      if (
        !["recipes", "units", "members"].includes(kind) ||
        (kind !== "recipes" && url.searchParams.has("id")) ||
        (kind === "members" ||
        (kind === "recipes" && url.searchParams.has("id"))
          ? (kind === "members" && !unitText) ||
            (unitText !== null &&
              (!/^\d+$/.test(unitText) || !positiveId(unitText)))
          : unitText !== null)
      )
        return send(400, { error: "Unidade ou consulta inválida." });
      const idText = url.searchParams.get("id"),
        pageText = url.searchParams.get("page") || "1";
      if (idText !== null && (!/^\d+$/.test(idText) || !positiveId(idText)))
        return send(400, { error: "Ficha inválida." });
      if (
        !/^\d+$/.test(pageText) ||
        !positiveId(pageText) ||
        Number(pageText) > 100
      )
        return send(400, { error: "Página inválida." });
      const result = await upstream({
        page: Number(pageText),
        kind,
        unit: unitText ? Number(unitText) : undefined,
        id: idText ? Number(idText) : undefined,
        refresh: url.searchParams.get("refresh") === "1",
      });
      return send(200, result);
    } catch (error) {
      const kind = error instanceof Error ? error.message : "";
      if (kind === "not_found")
        return send(404, { error: "Ficha não encontrada no Everest." });
      if (kind === "rate_limit") {
        res.setHeader("Retry-After", "2");
        return send(429, {
          error:
            "O Everest está recebendo outras consultas. Aguarde alguns segundos e tente novamente.",
        });
      }
      if (kind === "configuration")
        return send(503, {
          error: "A integração com o Everest está aguardando configuração.",
        });
      // Never forward upstream bodies, request headers or secrets to the browser/logs.
      return send(502, {
        error:
          "Não foi possível consultar o Everest agora. Tente novamente em instantes.",
      });
    }
  };
}
