import { visibleEverestUnit } from "./everest-units.mjs";
import { normalizeFicha, attachCosts } from "./everest.mjs";
import { checked, allRows, upsertChunks } from "./everest-store.mjs";
const positive = (n) => Number.isSafeInteger(Number(n)) && Number(n) > 0;
export function createSource({
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const environment = env.EVEREST_ENVIRONMENT || "production";
  const base = {
    production: "https://producao.acomsistemas.com.br",
    homologation: "https://homologacao.acomsistemas.com.br",
  }[environment];
  if (
    !base ||
    !env.EVEREST_ENTITY ||
    !env.EVEREST_USERNAME ||
    !env.EVEREST_PASSWORD
  )
    throw Error("source_configuration");
  let last = Date.now();
  return async function source(kind, { page = 1, unit, item } = {}) {
    const path =
      kind === "catalog"
        ? "/sis/empresa"
        : kind === "members"
          ? "/adm/itemempresa"
          : kind === "costs"
            ? `/adm/fichatecnica/item/${item}`
            : "/adm/fichatecnica";
    const url = new URL("/api" + path, base);
    url.searchParams.set("x-Entidade", env.EVEREST_ENTITY);
    if (kind === "costs" || kind === "members")
      url.searchParams.set("cd_empresa", String(unit));
    if (kind !== "costs") url.searchParams.set("x-Pagina", String(page));
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(Math.max(0, 1200 - (Date.now() - last)));
      last = Date.now();
      response = await fetchImpl(url, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${env.EVEREST_USERNAME}:${env.EVEREST_PASSWORD}`,
            ).toString("base64"),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
      if (![412, 429].includes(response.status) || attempt === 1) break;
      await response.text();
      await sleep(1800);
    }
    if (!response.ok)
      throw Error(
        [412, 429].includes(response.status)
          ? "source_rate_limit"
          : "source_unavailable",
      );
    const rows = await response.json();
    // Everest can return HTTP 200 with {} when this unit has no cost tree.
    // Accept only this precise empty response for costs; other shapes remain errors.
    if (
      kind === "costs" &&
      rows &&
      typeof rows === "object" &&
      !Array.isArray(rows) &&
      Object.keys(rows).length === 0
    )
      return { rows: [] };
    if (!Array.isArray(rows)) throw Error("source_shape");
    if (kind === "costs") return { rows };
    let total = Number(response.headers.get("x-paginas"));
    if (response.headers.get("x-paginas") === "0" && rows.length === 0)
      total = 1;
    if (!Number.isSafeInteger(total) || total < 1 || total > 100)
      throw Error("source_pagination");
    if (kind === "catalog" && rows.some((r) => !positive(r.cd_empresa)))
      throw Error("source_shape");
    if (
      kind === "members" &&
      rows.some((r) => Number(r.cd_empresa) !== unit || !positive(r.id_item))
    )
      throw Error("source_membership");
    if (
      kind === "recipes" &&
      rows.some((r) => !positive(r.id_fichatecnica) || !positive(r.id_item))
    )
      throw Error("source_shape");
    return { rows, total };
  };
}
export async function syncStep({
  db,
  source,
  job,
  environment = "production",
}) {
  const s = structuredClone(job.state);
  let progress = job.progress;
  const id = job.id;
  // A deployment may resume an older job whose targets still include hidden units.
  if (
    ["members", "prepare", "costs", "publish"].includes(s.phase) &&
    !visibleEverestUnit(s.targets[s.unitIndex]?.id)
  ) {
    s.unitIndex++;
    delete s.items;
    delete s.itemIndex;
    delete s.members;
    s.phase = s.unitIndex >= s.targets.length ? "complete" : "members";
    s.page = 1;
    s.members = [];
    return {
      done: false,
      state: s,
      progress: "Continuando atualização das unidades da biblioteca",
    };
  }
  if (s.phase === "catalog") {
    const { rows, total } = await source("catalog", { page: s.page });
    s.units = [
      ...new Map(
        [
          ...s.units,
          ...rows.map((r) => ({
            id: Number(r.cd_empresa),
            name:
              r.fantasia?.trim() ||
              r.razao?.trim() ||
              `Unidade ${r.cd_empresa}`,
          })),
        ].map((u) => [u.id, u]),
      ).values(),
    ];
    if (s.page < total) s.page++;
    else {
      if (!s.units.length) throw Error("empty_catalog");
      if (
        job.requested_unit &&
        !s.units.some((u) => u.id === job.requested_unit)
      )
        throw Error("removed_unit");
      for (const u of s.units) {
        const existing = await checked(
          db
            .from("receita_everest_unidade")
            .select("id")
            .eq("id", u.id)
            .maybeSingle(),
        );
        if (existing)
          await checked(
            db
              .from("receita_everest_unidade")
              .update({ name: u.name })
              .eq("id", u.id),
          );
        else await checked(db.from("receita_everest_unidade").insert(u));
      }
      s.targets = job.requested_unit
        ? s.units.filter(
            (u) => u.id === job.requested_unit && visibleEverestUnit(u.id),
          )
        : s.units.filter((u) => visibleEverestUnit(u.id));
      if (!s.targets.length) throw Error("removed_unit");
      s.phase = "recipes";
      s.page = 1;
    }
    progress = "Consultando o catálogo de unidades";
  } else if (s.phase === "recipes") {
    const { rows, total } = await source("recipes", { page: s.page });
    await upsertChunks(
      db,
      "receita_everest_template",
      rows.map((raw) => ({
        job_id: id,
        id: raw.id_fichatecnica,
        item_id: raw.id_item,
        raw,
      })),
    );
    progress = `Preparando fichas: página ${s.page} de ${total}`;
    if (s.page < total) s.page++;
    else {
      s.phase = "members";
      s.unitIndex = 0;
      s.page = 1;
      s.members = [];
    }
  } else if (s.phase === "members") {
    const unit = s.targets[s.unitIndex];
    const { rows, total } = await source("members", {
      unit: unit.id,
      page: s.page,
    });
    s.members = [
      ...new Set([...s.members, ...rows.map((r) => Number(r.id_item))]),
    ];
    progress = `${unit.name} · vínculos: página ${s.page} de ${total}`;
    if (s.page < total) s.page++;
    else s.phase = "prepare";
  } else if (s.phase === "prepare") {
    const unit = s.targets[s.unitIndex],
      members = new Set(s.members);
    const templates = await allRows(() =>
      db
        .from("receita_everest_template")
        .select("id,item_id,raw")
        .eq("job_id", id)
        .order("id"),
    );
    const included = templates.filter((r) => members.has(r.item_id));
    await upsertChunks(
      db,
      "receita_everest_snapshot",
      included.map((r) => ({
        snapshot_id: id,
        unit_id: unit.id,
        id: r.id,
        item_id: r.item_id,
        summary: normalizeFicha(r.raw),
        detail: normalizeFicha(r.raw, true),
        raw_ficha: r.raw,
        checked: false,
        raw_cost: null,
      })),
    );
    s.items = [...new Set(included.map((r) => r.item_id))].sort(
      (a, b) => a - b,
    );
    s.itemIndex = 0;
    s.expected = included.length;
    delete s.members;
    s.phase = s.items.length ? "costs" : "publish";
    progress = `${unit.name} · ${included.length} fichas a guardar`;
  } else if (s.phase === "costs") {
    const unit = s.targets[s.unitIndex],
      item = s.items[s.itemIndex];
    const { rows: rawCost } = await source("costs", { unit: unit.id, item });
    const rows = await checked(
      db
        .from("receita_everest_snapshot")
        .select("*")
        .eq("snapshot_id", id)
        .eq("unit_id", unit.id)
        .eq("item_id", item),
    );
    if (!rows.length) throw Error("missing_staging");
    await upsertChunks(
      db,
      "receita_everest_snapshot",
      rows.map((r) => ({
        ...r,
        detail: attachCosts(normalizeFicha(r.raw_ficha, true), rawCost),
        raw_cost: rawCost,
        checked: true,
      })),
    );
    if (!rawCost.length) {
      s.costWarnings = [...(s.costWarnings || []), { unit: unit.id, item }];
    }
    s.itemIndex++;
    progress = `${unit.name} · custos: ${s.itemIndex} de ${s.items.length} itens · unidade ${s.unitIndex + 1} de ${s.targets.length}`;
    if (s.itemIndex >= s.items.length) s.phase = "publish";
  } else if (s.phase === "publish") {
    const unit = s.targets[s.unitIndex];
    await checked(
      db.rpc("receita_everest_publish", {
        p_id: id,
        p_lease: job.lease_token,
        p_unit: unit.id,
        p_count: s.expected,
        p_environment: environment,
      }),
    );
    s.unitIndex++;
    delete s.items;
    delete s.itemIndex;
    if (s.unitIndex >= s.targets.length) s.phase = "complete";
    else {
      s.phase = "members";
      s.page = 1;
      s.members = [];
    }
    progress = `${unit.name} · livro atualizado`;
  } else if (s.phase === "complete") {
    await checked(
      db.rpc("receita_everest_complete", {
        p_id: id,
        p_lease: job.lease_token,
        p_units: s.units.map((u) => u.id),
      }),
    );
    return { done: true, state: s, progress: "Atualização concluída" };
  } else throw Error("invalid_state");
  return { done: false, state: s, progress };
}
export async function runWorker({
  db,
  source,
  environment = "production",
  budgetMs = 45000,
  now = Date.now,
}) {
  const job = await checked(db.rpc("receita_everest_claim"));
  if (!job?.id) return { idle: true };
  const start = now();
  let steps = 0;
  try {
    while (now() - start < budgetMs) {
      const result = await syncStep({ db, source, job, environment });
      steps++;
      if (result.done) return { done: true, steps };
      const ok = await checked(
        db.rpc("receita_everest_checkpoint", {
          p_id: job.id,
          p_lease: job.lease_token,
          p_state: result.state,
          p_progress: result.progress,
        }),
      );
      if (!ok) throw Error("lost_lease");
      job.state = result.state;
      job.progress = result.progress;
    }
    await checked(
      db.rpc("receita_everest_checkpoint", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_state: job.state,
        p_progress: job.progress,
        p_release: true,
      }),
    );
    return { done: false, steps };
  } catch (error) {
    const phase = job.state.phase;
    const unit = job.state.targets?.[job.state.unitIndex]?.id;
    const item = job.state.items?.[job.state.itemIndex];
    const known = {
      source_shape: "O Everest retornou dados em formato inesperado",
      source_rate_limit: "O Everest limitou temporariamente as consultas",
      source_unavailable: "O Everest não concluiu a consulta",
      source_pagination: "O Everest retornou paginação inválida",
      source_membership: "O Everest retornou vínculos de outra unidade",
      database_operation: "Não foi possível gravar ou consultar o banco",
      lost_lease: "A execução perdeu sua reserva de processamento",
    };
    const reason =
      error?.name === "TimeoutError"
        ? "O Everest excedeu o tempo de resposta"
        : known[error?.message] || "A consulta foi interrompida";
    const location = [
      phase && `etapa ${phase}`,
      unit && `unidade ${unit}`,
      item && `item ${item}`,
    ]
      .filter(Boolean)
      .join(" · ");
    await checked(
      db.rpc("receita_everest_failure", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_error: `${reason} (${location}). A versão publicada foi preservada.`,
      }),
    );
    return { retry: true, steps };
  }
}
