import { visibleEverestUnit } from "./everest-units.mjs";
import { database, checked, allRows, authorized } from "./everest-store.mjs";
import { normalizeFicha, attachCosts } from "./everest.mjs";
const validId = (value) =>
  /^\d+$/.test(String(value)) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0;
export const publicJob = (j) =>
  !j
    ? null
    : {
        id: j.id,
        status: j.status,
        progress: j.progress,
        error: j.error,
        requestedUnit: j.requested_unit,
        createdAt: j.created_at,
        finishedAt: j.finished_at,
        costWarningCount:
          j.state?.costWarnings?.filter((w) => visibleEverestUnit(w.unit))
            .length || 0,
      };
export async function latestJob(db) {
  return publicJob(
    await checked(
      db
        .from("receita_everest_sync")
        .select(
          "id,status,progress,error,requested_unit,created_at,finished_at,state",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
}
export function createSnapshotHandler({
  env = process.env,
  getDb = () => database(env),
  authorize = (req) => authorized(req, env),
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, data) => res.status(status).json(data);
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return send(405, { error: "Método não permitido." });
    }
    try {
      const access = await authorize(req);
      if (!access.user) return send(access.status, { error: access.error });
      const db = getDb();
      if (req.method === "POST") {
        let body = req.body;
        if (typeof body === "string") {
          try {
            body = JSON.parse(body);
          } catch {
            return send(400, { error: "Solicitação inválida." });
          }
        }
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some((k) => k !== "unitId") ||
          (body.unitId != null && !validId(body.unitId))
        )
          return send(400, { error: "Unidade inválida." });
        if (body.unitId != null) {
          if (!visibleEverestUnit(body.unitId))
            return send(404, {
              error: "Unidade não disponível na biblioteca.",
            });
          const exists = await checked(
            db
              .from("receita_everest_unidade")
              .select("id")
              .eq("id", Number(body.unitId))
              .eq("enabled", true)
              .maybeSingle(),
          );
          if (!exists) return send(404, { error: "Unidade não encontrada." });
        }
        const job = await checked(
          db.rpc("receita_everest_start", {
            p_user: access.user.id,
            p_unit: body.unitId == null ? null : Number(body.unitId),
          }),
        );
        return send(202, { job: publicJob(job) });
      }
      const url = new URL(req.url, "http://localhost");
      if (
        [...url.searchParams.keys()].some(
          (k) => !["kind", "unit", "id", "snapshot"].includes(k),
        ) ||
        [...url.searchParams.keys()].some(
          (k) => url.searchParams.getAll(k).length > 1,
        )
      )
        return send(400, { error: "Consulta inválida." });
      const kind = url.searchParams.get("kind") || "detail";
      if (kind === "units") {
        const [units, job] = await Promise.all([
          checked(
            db
              .from("receita_everest_unidade")
              .select("id,name,synced_at,recipe_count")
              .eq("enabled", true)
              .order("name"),
          ),
          latestJob(db),
        ]);
        return send(200, {
          records: units
            .filter((u) => visibleEverestUnit(u.id))
            .map((u) => ({
              id: u.id,
              name: u.name,
              syncedAt: u.synced_at,
              recipeCount: u.recipe_count,
            })),
          job,
          totalPages: 1,
          page: 1,
        });
      }
      if (
        !["book", "detail"].includes(kind) ||
        !validId(url.searchParams.get("unit"))
      )
        return send(400, { error: "Unidade inválida." });
      const unitId = Number(url.searchParams.get("unit"));
      if (!visibleEverestUnit(unitId))
        return send(404, { error: "Unidade não disponível na biblioteca." });
      const unit = await checked(
        db
          .from("receita_everest_unidade")
          .select("*")
          .eq("id", unitId)
          .eq("enabled", true)
          .maybeSingle(),
      );
      if (!unit) return send(404, { error: "Unidade não encontrada." });
      if (kind === "book") {
        const rows = unit.snapshot_id
          ? await allRows(() =>
              db
                .from("receita_everest_snapshot")
                .select("summary")
                .eq("unit_id", unitId)
                .eq("snapshot_id", unit.snapshot_id)
                .order("id"),
            )
          : [];
        return send(200, {
          records: rows.map((r) => r.summary),
          snapshotId: unit.snapshot_id,
          fetchedAt: unit.synced_at || "",
          environment: unit.environment,
          totalPages: 1,
          page: 1,
        });
      }
      const id = url.searchParams.get("id");
      if (!validId(id)) return send(400, { error: "Ficha inválida." });
      const snapshot = url.searchParams.get("snapshot") || unit.snapshot_id;
      if (
        !snapshot ||
        ![unit.snapshot_id, unit.previous_snapshot_id].includes(snapshot)
      )
        return send(409, {
          error:
            "Este livro recebeu uma nova versão. Reabra o livro para consultar.",
        });
      const row = await checked(
        db
          .from("receita_everest_snapshot")
          .select("raw_ficha,raw_cost")
          .eq("snapshot_id", snapshot)
          .eq("unit_id", unitId)
          .eq("id", Number(id))
          .maybeSingle(),
      );
      if (!row)
        return send(404, {
          error: "Ficha não encontrada na cópia desta unidade.",
        });
      return send(200, {
        record: attachCosts(normalizeFicha(row.raw_ficha, true), row.raw_cost),
        fetchedAt: unit.synced_at,
      });
    } catch {
      return send(503, {
        error: "Não foi possível acessar a cópia salva agora. Tente novamente.",
      });
    }
  };
}
