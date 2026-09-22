import { visibleRecipe } from "../shared/everest-catalog.mjs";
import { visibleEverestUnit } from "./everest-units.mjs";
import { randomUUID } from "node:crypto";
import { database, checked, authorized } from "./everest-store.mjs";
export const BUCKET = "receita-everest-preparo";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v) =>
  /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0;
export function validateContent(value, unit, ficha) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value.steps) ||
    value.steps.length > 24
  )
    return null;
  let photos = 0;
  const photo = (p) => {
    if (p === null) return null;
    if (
      typeof p !== "string" ||
      !p.startsWith(`${unit}/${ficha}/`) ||
      !uuid.test(p.slice(`${unit}/${ficha}/`.length, -4)) ||
      !p.endsWith(".jpg")
    )
      throw Error("photo");
    photos++;
    return p;
  };
  try {
    const content = {
      steps: value.steps.map((s) => {
        if (
          !s ||
          typeof s.title !== "string" ||
          s.title.length > 100 ||
          typeof s.text !== "string" ||
          !s.text.trim() ||
          s.text.length > 4000 ||
          !Array.isArray(s.photos) ||
          s.photos.length > 3
        )
          throw Error("step");
        return {
          title: s.title.trim(),
          text: s.text.trim(),
          photos: s.photos.map((p) => {
            if (p === null) throw Error("photo");
            return photo(p);
          }),
        };
      }),
      finalPhoto: photo(value.finalPhoto ?? null),
    };
    return photos <= 24 &&
      Buffer.byteLength(JSON.stringify(content), "utf8") <= 100000
      ? content
      : null;
  } catch {
    return null;
  }
}
export const photoPaths = (c) => [
  ...new Set(
    [c.finalPhoto, ...c.steps.flatMap((s) => s.photos)].filter(Boolean),
  ),
];
export function createPreparationHandler({
  getDb = () => database(),
  authorize = (req) => authorized(req),
} = {}) {
  return async (req, res) => {
    const send = (s, d) => res.status(s).json(d);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    if (!["GET", "PUT", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, PUT, POST");
      return send(405, { error: "Método não permitido." });
    }
    try {
      const access = await authorize(req);
      if (!access.user) return send(access.status, { error: access.error });
      const url = new URL(req.url, "http://localhost");
      const unit = url.searchParams.get("unit"),
        ficha = url.searchParams.get("id");
      if (!id(unit) || !id(ficha))
        return send(400, { error: "Ficha ou unidade inválida." });
      if (!visibleEverestUnit(unit))
        return send(404, { error: "Unidade não disponível na biblioteca." });
      const db = getDb();
      const book = await checked(
        db
          .from("receita_everest_unidade")
          .select("snapshot_id")
          .eq("id", Number(unit))
          .eq("enabled", true)
          .maybeSingle(),
      );
      const member =
        book?.snapshot_id &&
        (await checked(
          db
            .from("receita_everest_snapshot")
            .select("id,summary")
            .eq("unit_id", Number(unit))
            .eq("snapshot_id", book.snapshot_id)
            .eq("id", Number(ficha))
            .maybeSingle(),
        ));
      if (!member || !visibleRecipe(member.summary?.name, Number(unit)))
        return send(404, {
          error:
            "Esta ficha não está disponível nesta unidade. Reabra o livro.",
        });
      const storage = db.storage.from(BUCKET);
      const present = async (row) => {
        const content = row?.content || { steps: [], finalPhoto: null };
        const paths = photoPaths(content);
        const signed = paths.length
          ? await checked(storage.createSignedUrls(paths, 3600))
          : [];
        return {
          content,
          revision: row?.revision || null,
          updatedAt: row?.updated_at || null,
          photos: Object.fromEntries(
            signed.filter((p) => p.signedUrl).map((p) => [p.path, p.signedUrl]),
          ),
        };
      };
      if (req.method === "GET")
        return send(
          200,
          await present(
            await checked(
              db
                .from("receita_everest_preparo")
                .select("*")
                .eq("unit_id", Number(unit))
                .eq("ficha_id", Number(ficha))
                .maybeSingle(),
            ),
          ),
        );
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return send(400, { error: "Conteúdo inválido." });
        }
      }
      if (req.method === "POST") {
        if (body?.action !== "upload")
          return send(400, { error: "Ação inválida." });
        const path = `${Number(unit)}/${Number(ficha)}/${randomUUID()}.jpg`;
        const data = await checked(storage.createSignedUploadUrl(path));
        return send(200, { path, token: data.token });
      }
      const content = validateContent(
        body?.content,
        Number(unit),
        Number(ficha),
      );
      if (
        !content ||
        (body.revision !== null && !uuid.test(body.revision || ""))
      )
        return send(400, {
          error:
            "Revise as etapas e fotos. Use até 24 etapas e 24 fotos (3 por etapa).",
        });
      const saved = await checked(
        db.rpc("receita_everest_save_preparo", {
          p_unit: Number(unit),
          p_ficha: Number(ficha),
          p_content: content,
          p_revision: body.revision,
          p_user: access.user.id,
        }),
      );
      if (!saved?.length)
        return send(409, {
          error:
            "Este preparo foi alterado em outra janela. Copie suas alterações e reabra a ficha antes de salvar.",
        });
      // Once committed, never report a failed save just because URL signing fails.
      let response;
      try {
        response = await present(saved[0]);
      } catch {
        response = {
          content: saved[0].content,
          revision: saved[0].revision,
          updatedAt: saved[0].updated_at,
          photos: {},
        };
      }
      return send(200, response);
    } catch {
      return send(503, {
        error:
          "Não foi possível acessar o preparo agora. Suas alterações continuam na tela; tente novamente.",
      });
    }
  };
}
