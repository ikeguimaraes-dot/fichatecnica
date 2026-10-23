import { authorized } from "./everest-store.mjs";

const str = (value) => (value == null ? "" : String(value).trim());
const num = (value) =>
  value == null || str(value) === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const id = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
export const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function normalizeStock(kind, row) {
  if (!row || typeof row !== "object") throw Error("invalid_response");
  if (kind === "invoices") {
    if (!id(row.id_notarecebida) || !id(row.cd_empresa))
      throw Error("invalid_response");
    return {
      id: Number(row.id_notarecebida),
      unitId: Number(row.cd_empresa),
      unitName: str(row.fantasia_destinatario) || str(row.razao_destinatario),
      number: str(row.nr_nota),
      series: str(row.cd_serie_fiscal),
      supplier: str(row.fantasia_emitente) || str(row.razao_emitente),
      issuedAt: str(row.dh_emissao),
      total: num(row.vl_total),
      status: num(row.at_situacao),
    };
  }
  if (kind === "catalog") {
    if (!id(row.id_item)) throw Error("invalid_response");
    return {
      id: Number(row.id_item),
      packaging: Array.isArray(row.embalagens)
        ? row.embalagens.map((p) => ({
            id: num(p.id_embalagem),
            unit: str(p.sg_unidademedida),
            factor: num(p.qt_item),
            stock: p.fl_padrao_estoque === "S",
          }))
        : [],
      category:
        str(row.ds_grupo) ||
        (row.cd_grupo ? `Grupo ${row.cd_grupo}` : "Sem categoria"),
    };
  }
  if (!id(row.id_notarecebidaitem) || !id(row.id_notarecebida))
    throw Error("invalid_response");
  return {
    id: Number(row.id_notarecebidaitem),
    invoiceId: Number(row.id_notarecebida),
    itemId: num(row.id_item),
    code: str(row.cd_item),
    name: str(row.ds_item),
    unit: str(row.sg_unidademedida),
    quantity: num(row.qt_embalagem),
    convertedQuantity: num(row.qt_convertido),
    packagingId: num(row.id_embalagem),
    unitPrice: num(row.vl_unitario),
    total: num(row.vl_total),
  };
}
export function createStockSource({
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let queue = Promise.resolve(),
    lastStart = 0;
  return (query) => {
    const task = queue.then(async () => {
      const base = {
        production: "https://producao.acomsistemas.com.br",
        homologation: "https://homologacao.acomsistemas.com.br",
      }[env.EVEREST_ENVIRONMENT || "production"];
      if (
        !base ||
        !env.EVEREST_ENTITY ||
        !env.EVEREST_USERNAME ||
        !env.EVEREST_PASSWORD
      )
        throw Error("configuration");
      const { kind, page, start, end, unit } = query;
      const url = new URL(
        "/api" +
          {
            invoices: "/dfi/notarecebida",
            items: "/dfi/notarecebidaitem",
            catalog: "/adm/item",
          }[kind],
        base,
      );
      url.searchParams.set("x-Entidade", env.EVEREST_ENTITY);
      url.searchParams.set("x-Pagina", String(page));
      if (kind === "invoices") {
        url.searchParams.set("lancamento_inicial", start);
        url.searchParams.set("lancamento_final", end);
      }
      if (kind === "items") {
        url.searchParams.set("cd_empresa", String(unit));
        url.searchParams.set("dt_lancamento_ini", start);
        url.searchParams.set("dt_lancamento_fin", end);
      }
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(Math.max(0, 1200 - (Date.now() - lastStart)));
        lastStart = Date.now();
        response = await fetchImpl(url, {
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
        if (![412, 429].includes(response.status)) break;
        await response.text();
        await sleep(1800);
      }
      if ([412, 429].includes(response.status)) throw Error("rate_limit");
      if (!response.ok) throw Error("upstream");
      const raw = await response.json();
      if (!Array.isArray(raw)) throw Error("invalid_response");
      const pagination = response.headers.get("x-paginas");
      const totalPages =
        pagination === "0" && raw.length === 0 ? 1 : Number(pagination);
      if (
        !Number.isSafeInteger(totalPages) ||
        totalPages < 1 ||
        totalPages > 10000 ||
        page > totalPages
      )
        throw Error("invalid_pagination");
      return {
        records: raw.map((row) => normalizeStock(kind, row)),
        page,
        totalPages,
        fetchedAt: new Date().toISOString(),
      };
    });
    queue = task.catch(() => {});
    return task;
  };
}
export function createStockHandler({
  env = process.env,
  fetchImpl = fetch,
  source = createStockSource({ env, fetchImpl }),
  authorize = authorized,
} = {}) {
  return async (req, res) => {
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
    try {
      const access = await authorize(req, env, fetchImpl);
      if (!access.user) return send(access.status, { error: access.error });
      const params = new URL(req.url, "http://localhost").searchParams;
      const kind = params.get("kind") || "invoices",
        page = params.get("page") || "1",
        start = params.get("start"),
        end = params.get("end"),
        unit = params.get("unit");
      if (
        [...params.keys()].some(
          (key) => !["kind", "page", "start", "end", "unit"].includes(key),
        ) ||
        !["invoices", "items", "catalog"].includes(kind) ||
        !/^\d+$/.test(page) ||
        !id(page) ||
        Number(page) > 10000 ||
        (kind !== "catalog" &&
          (!validDate(start) || !validDate(end) || start > end)) ||
        (kind === "items" && (!/^\d+$/.test(unit || "") || !id(unit)))
      )
        return send(400, {
          error: "Período ou parâmetros de consulta inválidos.",
        });
      return send(
        200,
        await source({
          kind,
          page: Number(page),
          start,
          end,
          unit: Number(unit),
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "configuration")
        return send(503, {
          error: "A integração com o Everest está aguardando configuração.",
        });
      if (reason === "rate_limit") {
        res.setHeader("Retry-After", "3");
        return send(429, {
          error: "Everest ocupado. Aguarde alguns segundos e tente novamente.",
        });
      }
      return send(502, {
        error:
          "Não foi possível concluir a consulta de estoque no Everest. Tente novamente.",
      });
    }
  };
}
