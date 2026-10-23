import { authorized, database, checked, allRows } from "./everest-store.mjs";
import { validDate } from "./everest-stock.mjs";
import { visibleEverestUnit } from "./everest-units.mjs";
import {
  STOCK_START,
  recipeRequirements,
  saleKey,
  finite,
  measure,
} from "../shared/stock-ledger.mjs";

export function assembleContext({
  unit,
  workdays,
  sales,
  snapshots,
  mappings,
  links,
  recipeIds,
  end,
}) {
  const issues = [],
    pending = [],
    byDay = new Map(workdays.map((w) => [w.id, w]));
  const lastDate =
    workdays
      .map((w) => w.data)
      .sort()
      .at(-1) || null;
  const daily = [];
  for (
    let date = STOCK_START;
    date <= end;
    date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)
  ) {
    const days = workdays.filter((w) => w.data === date),
      records = sales.filter((s) => days.some((w) => w.id === s.workday_id_fk));
    daily.push({
      date,
      workdays: days.length,
      products: records.length,
      quantity: records.reduce((n, s) => n + (finite(s.qtd) || 0), 0),
    });
    if (!days.length)
      issues.push(
        `${date}: sem movimento Lorean importado; não equivale a venda zero`,
      );
  }
  const recipes = new Map(snapshots.map((s) => [s.id, s]));
  const oldRecipeIds = new Map(
    recipeIds.map((r) => [r.id, r.everest_id_fichatecnica]),
  );
  const saleGroups = new Map();
  for (const sale of sales) {
    const day = byDay.get(sale.workday_id_fk);
    if (!day) throw Error("inconsistent_sales");
    const key = saleKey(sale.produto),
      group = saleGroups.get(key) || {
        name: sale.produto,
        key,
        quantity: 0,
        netCents: 0,
        valueInvalid: false,
        groups: new Set(),
        suspect: false,
        invalid: false,
      };
    const quantity = finite(sale.qtd);
    if (quantity === null || quantity < 0) group.invalid = true;
    else group.quantity += quantity;
    if (sale.grupo) group.groups.add(String(sale.grupo).trim());
    const gross = finite(sale.bruto),
      discount = finite(sale.desconto);
    if (gross === null || discount === null) group.valueInvalid = true;
    else group.netCents += Math.round((gross - discount) * 100);
    group.suspect ||= Boolean(day.qualidade_suspeito);
    saleGroups.set(key, group);
  }
  for (const day of workdays)
    if (!sales.some((s) => s.workday_id_fk === day.id))
      issues.push(
        `${day.data}: movimento ${day.workday_id} sem produtos importados`,
      );
  const dishes = [],
    mappedRecipeIds = new Set();
  for (const group of saleGroups.values()) {
    const explicit = links.find((l) => l.sale_name === group.key);
    const confirmed = mappings.filter(
      (m) => saleKey(m.nome_venda) === group.key && m.status === "confirmado",
    );
    const recipeId =
      explicit?.recipe_id ??
      (confirmed.length === 1 ? oldRecipeIds.get(confirmed[0].ficha_id) : null);
    const snapshot = recipes.get(recipeId),
      raw = snapshot?.raw_ficha;
    const output = explicit
      ? Number(explicit.output_per_sale)
      : raw && measure(raw.sg_unidademedida)[0] === "UN"
        ? 1
        : null;
    const calculated = raw
      ? recipeRequirements(raw, snapshot.raw_cost, output)
      : {
          requirements: [],
          reason: "Produto vendido sem ficha confirmada nesta unidade",
        };
    const reason = group.invalid
      ? "Quantidade de venda inválida ou estorno sem conciliação"
      : group.suspect
        ? "Movimento Lorean marcado para conferência"
        : calculated.reason;
    if (reason)
      pending.push({
        name: group.name,
        quantity: group.quantity,
        reason,
        recipeId: recipeId || null,
        outputPerSale: output,
      });
    if (snapshot) {
      mappedRecipeIds.add(snapshot.id);
      dishes.push({
        id: `sale:${group.key}`,
        recipeId: snapshot.id,
        name: group.name,
        recipeName: raw.ds_item,
        itemId: Number(raw.id_item),
        sold: group.quantity,
        outputPerSale: output,
        outputUnit: raw.sg_unidademedida,
        requirements: reason ? [] : calculated.requirements,
        reason,
      });
    }
  }
  // Include unsold dishes too: availability is per dish, not a combined production plan.
  for (const snapshot of snapshots) {
    const raw = snapshot.raw_ficha;
    if (
      mappedRecipeIds.has(snapshot.id) ||
      /^PROD[.\s]/i.test(raw.ds_item || "") ||
      Number(raw.at_situacao) !== 1
    )
      continue;
    const output = measure(raw.sg_unidademedida)[0] === "UN" ? 1 : null;
    const result = recipeRequirements(raw, snapshot.raw_cost, output);
    dishes.push({
      id: `recipe:${snapshot.id}`,
      recipeId: snapshot.id,
      name: raw.ds_item,
      recipeName: raw.ds_item,
      itemId: Number(raw.id_item),
      sold: 0,
      outputPerSale: output,
      outputUnit: raw.sg_unidademedida,
      ...result,
    });
  }
  return {
    unit: { id: unit.id, name: unit.name },
    start: STOCK_START,
    end,
    lastDate,
    syncedAt: unit.synced_at,
    snapshotId: unit.snapshot_id,
    daily,
    issues,
    pending,
    dishes,
    options: snapshots.map((s) => ({
      id: s.id,
      name: s.raw_ficha.ds_item,
      unit: s.raw_ficha.sg_unidademedida,
      yield: s.raw_ficha.qt_producao,
    })),
    sales: [...saleGroups.values()].map((s) => ({
      name: s.name,
      quantity: s.quantity,
      quantityValid: !s.invalid,
      netValue: s.valueInvalid ? null : s.netCents / 100,
      suspect: s.suspect,
      groups: [...s.groups].sort(),
    })),
  };
}
export async function readContext(db, unitId, end) {
  const unit = await checked(
    db
      .from("receita_everest_unidade")
      .select("id,name,snapshot_id,synced_at")
      .eq("id", unitId)
      .eq("enabled", true)
      .maybeSingle(),
  );
  if (!unit?.snapshot_id) throw Error("missing_unit");
  const mapping = await checked(
    db
      .from("everest_unidades")
      .select("unit_id")
      .eq("everest_cd_empresa", unitId)
      .eq("everest_ambiente", "producao")
      .maybeSingle(),
  );
  if (!mapping?.unit_id) throw Error("missing_unit");
  const lock = await checked(
    db.from("lorean_import_lock").select("id,started_at"),
  );
  if (lock.length) throw Error("sales_importing");
  const readDays = () =>
    allRows(() =>
      db
        .from("lorean_workdays")
        .select("id,data,workday_id,qualidade_suspeito,source_sha256,criado_em")
        .eq("unit_id", mapping.unit_id)
        .gte("data", STOCK_START)
        .lte("data", end)
        .order("id"),
    );
  const workdays = await readDays();
  const sales = [];
  for (let i = 0; i < workdays.length; i += 100)
    sales.push(
      ...(await allRows(() =>
        db
          .from("lorean_produtos_dia")
          .select("id,workday_id_fk,produto,grupo,qtd,bruto,desconto")
          .in(
            "workday_id_fk",
            workdays.slice(i, i + 100).map((w) => w.id),
          )
          .order("id"),
      )),
    );
  const [snapshots, mappings, links, recipeIds] = await Promise.all([
    allRows(() =>
      db
        .from("receita_everest_snapshot")
        .select("id,raw_ficha,raw_cost")
        .eq("snapshot_id", unit.snapshot_id)
        .eq("unit_id", unitId)
        .order("id"),
    ),
    allRows(() =>
      db
        .from("produto_venda_ficha")
        .select("id,nome_venda,ficha_id,status")
        .eq("unit_id", mapping.unit_id)
        .eq("status", "confirmado")
        .order("id"),
    ),
    allRows(() =>
      db
        .from("receita_estoque_vinculo")
        .select("sale_name,recipe_id,output_per_sale")
        .eq("unit_id", unitId)
        .order("sale_name"),
    ),
    allRows(() =>
      db
        .from("everest_fichas_tecnicas")
        .select("id,everest_id_fichatecnica")
        .order("id"),
    ),
  ]);
  if (
    (await checked(db.from("lorean_import_lock").select("id"))).length ||
    JSON.stringify(workdays) !== JSON.stringify(await readDays())
  )
    throw Error("sales_importing");
  return assembleContext({
    unit,
    workdays,
    sales,
    snapshots,
    mappings,
    links,
    recipeIds,
    end,
  });
}
export function createStockContextHandler({
  env = process.env,
  fetchImpl = fetch,
  authorize = authorized,
  makeDb = database,
  read = readContext,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return send(405, { error: "Método não permitido." });
    }
    try {
      const access = await authorize(req, env, fetchImpl);
      if (!access.user) return send(access.status, { error: access.error });
      const db = makeDb(env),
        params = new URL(req.url, "http://localhost").searchParams;
      if (req.method === "POST") {
        const body =
          typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const unitId = Number(body?.unitId),
          recipeId = Number(body?.recipeId),
          quantity = finite(body?.outputPerSale),
          name = saleKey(body?.saleName);
        if (
          !Number.isSafeInteger(unitId) ||
          !visibleEverestUnit(unitId) ||
          !Number.isSafeInteger(recipeId) ||
          recipeId <= 0 ||
          !name ||
          name.length > 300 ||
          !(quantity > 0 && quantity < 1000000)
        )
          return send(400, {
            error:
              "Informe unidade, produto, ficha e quantidade válida por venda.",
          });
        const unit = await checked(
          db
            .from("receita_everest_unidade")
            .select("snapshot_id")
            .eq("id", unitId)
            .eq("enabled", true)
            .maybeSingle(),
        );
        const recipe =
          unit?.snapshot_id &&
          (await checked(
            db
              .from("receita_everest_snapshot")
              .select("id")
              .eq("unit_id", unitId)
              .eq("snapshot_id", unit.snapshot_id)
              .eq("id", recipeId)
              .maybeSingle(),
          ));
        if (!recipe)
          return send(400, {
            error: "Ficha não pertence à unidade selecionada.",
          });
        await checked(
          db.from("receita_estoque_vinculo").upsert(
            {
              unit_id: unitId,
              sale_name: name,
              recipe_id: recipeId,
              output_per_sale: quantity,
              updated_by: access.user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "unit_id,sale_name" },
          ),
        );
        return send(200, { saved: true });
      }
      const unit = params.get("unit"),
        end = params.get("end");
      if (
        [...params.keys()].some((k) => !["unit", "end"].includes(k)) ||
        !/^\d+$/.test(unit || "") ||
        !visibleEverestUnit(Number(unit)) ||
        !validDate(end) ||
        end < STOCK_START ||
        end >
          new Intl.DateTimeFormat("sv-SE", {
            timeZone: "America/Sao_Paulo",
          }).format(new Date())
      )
        return send(400, { error: "Unidade ou data inválida." });
      const result = await read(db, Number(unit), end);
      result.canEdit = (env.EVEREST_ALLOWED_USER_IDS || "")
        .split(",")
        .map((v) => v.trim())
        .includes(access.user.id);
      return send(200, result);
    } catch (err) {
      const messages = {
        missing_unit: "Unidade sem vínculo Lorean ou sem fichas sincronizadas.",
        sales_importing:
          "As vendas estão sendo atualizadas. Aguarde e consulte novamente.",
        database_configuration: "Banco de estoque ainda não configurado.",
      };
      return send(503, {
        error:
          messages[err?.message] ||
          "Não foi possível consultar as vendas e fichas. Tente novamente.",
      });
    }
  };
}
