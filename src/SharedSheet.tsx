import { useRef } from "react";
import { Edit3, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Modal } from "./Modal";
import {
  EverestPreparation,
  type Preparation,
  type Content,
  type PreparationAdapter,
} from "./EverestPreparation";
import { supabase } from "./supabase";
import {
  totalCost,
  costPerKg,
  itemCost,
  money,
  yieldLabel,
  costPerKgLabel,
  type Recipe,
} from "./model";
import type { EverestDetail } from "./everest-types";
type SharedRecipe = Recipe & { revision: string };
const bucket = "receita-compartilhada-fotos";
export function SharedSheet({
  recipe,
  bookName,
  session,
  canEdit,
  saving,
  error,
  onClose,
  onEdit,
  onDelete,
  onSaved,
}: {
  recipe: SharedRecipe;
  bookName: string;
  session: Session;
  canEdit: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaved: (r: SharedRecipe) => void;
}) {
  const current = useRef(recipe),
    dirty = useRef(false);
  const leave = (action: () => void) => {
    if (
      !dirty.current ||
      confirm("Descartar as alterações ainda não salvas do preparo?")
    )
      action();
  };
  async function present(r: SharedRecipe): Promise<Preparation> {
    const content: Content = {
      steps: r.steps.map((s) => ({
        title: s.title || "",
        text: s.text,
        photos: s.photos || (s.photo ? [s.photo] : []),
      })),
      finalPhoto: r.cover || null,
    };
    const paths = [
      ...new Set(
        [content.finalPhoto, ...content.steps.flatMap((s) => s.photos)].filter(
          Boolean,
        ),
      ),
    ] as string[];
    const photos: Record<string, string> = {};
    if (paths.length) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 3600);
      if (error)
        throw Error(
          "Não foi possível carregar as fotos do preparo. Tente novamente.",
        );
      data.forEach((p) => {
        if (p.path && p.signedUrl) photos[p.path] = p.signedUrl;
      });
    }
    return { content, revision: r.revision, updatedAt: r.updated_at, photos };
  }
  const adapter: PreparationAdapter = {
    load: () => present(current.current),
    upload: async (blob) => {
      const path = `${session.user.id}/${recipe.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error)
        throw Error("Não foi possível enviar a foto. Tente novamente.");
      return path;
    },
    save: async (content, revision) => {
      const next: SharedRecipe = {
        ...current.current,
        cover: content.finalPhoto || "",
        steps: content.steps.map((s) => ({
          id: crypto.randomUUID(),
          title: s.title,
          text: s.text,
          photo: s.photos[0] || "",
          photos: s.photos,
        })),
        revision: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      };
      const {
        revision: _revision,
        user_id: _user,
        book_id: _book,
        ...data
      } = next;
      const result = await supabase
        .from("receita_compartilhada")
        .update({
          content: data,
          revision: next.revision,
          updated_at: next.updated_at,
        })
        .eq("id", recipe.id)
        .eq("revision", revision)
        .select("id");
      if (result.error)
        throw Error("Não foi possível salvar o preparo. Tente novamente.");
      if (!result.data?.length)
        throw Error(
          "Esta receita mudou em outra janela. Copie suas alterações e reabra a ficha antes de salvar.",
        );
      current.current = next;
      onSaved(next);
      try {
        return await present(next);
      } catch {
        return {
          content,
          revision: next.revision,
          updatedAt: next.updated_at,
          photos: {},
        };
      }
    },
  };
  const technical: EverestDetail = {
    id: 0,
    itemId: null,
    code: "",
    name: recipe.title,
    unit: "KG",
    quantity: recipe.yield_kg,
    yieldKg: recipe.yield_kg,
    version: null,
    versionDate: recipe.updated_at,
    status: 1,
    released: true,
    componentCount: recipe.ingredients.length,
    packaging: "",
    instructions: "",
    notes: recipe.notes,
    shelfLifeDays: null,
    costStatus: "available",
    totalCost: totalCost(recipe),
    costPerKg: costPerKg(recipe),
    costAudit: null,
    components: recipe.ingredients.map((i) => ({
      itemId: null,
      code: "",
      name: i.name,
      packaging: "",
      unit: i.unit,
      quantity: i.quantity,
      utilization: null,
      type: null,
      unitCost: i.unit === "kg" ? i.price : i.price / 1000,
      appliedCost: itemCost(i),
      stockUnitCost: null,
      costBasis: "everest",
    })),
  };
  const ingredients = (costs: boolean) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Ingrediente</th>
            <th>Quantidade</th>
            {costs && (
              <>
                <th>Preço / kg ou L</th>
                <th>Custo</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {recipe.ingredients.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td>
              <td>
                {i.quantity} {i.unit}
              </td>
              {costs && (
                <>
                  <td>
                    {money(i.price)} / {i.unit === "ml" ? "L" : "kg"}
                  </td>
                  <td>{money(itemCost(i))}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const summary = (
    <div className="detail-summary shared-recipe-summary">
      <div>
        <span>Rendimento</span>
        <strong>{yieldLabel(recipe)}</strong>
      </div>
      <div>
        <span>Preparo</span>
        <strong>{recipe.minutes} min</strong>
      </div>
    </div>
  );
  return (
    <Modal
      wide
      onClose={() => {
        if (!saving) leave(onClose);
      }}
    >
      <div className="everest-detail">
        <div className="eyebrow">FICHA TÉCNICA · LE CHEF</div>
        <h2>{recipe.title}</h2>
        <p className="everest-detail-code">{bookName} · Livro compartilhado</p>
        {recipe.description && <p>{recipe.description}</p>}
        <EverestPreparation
          detail={technical}
          unit={{ id: 0, name: bookName, syncedAt: null, recipeCount: 0 }}
          adapter={adapter}
          canEdit={canEdit}
          onDirty={(d) => {
            dirty.current = d;
          }}
        >
          <div className="detail-actions">
            {canEdit && (
              <>
                <button
                  className="primary"
                  disabled={saving}
                  onClick={() => leave(onEdit)}
                >
                  <Edit3 size={16} />
                  Editar receita
                </button>
                <button
                  className="secondary"
                  disabled={saving}
                  onClick={() => leave(onDelete)}
                >
                  <Trash2 size={16} />
                  Excluir receita
                </button>
              </>
            )}
          </div>
          <div className="everest-cost-summary">
            <div>
              <span>Custo total da ficha</span>
              <strong>{money(totalCost(recipe))}</strong>
              <small>Para o rendimento desta receita</small>
            </div>
            <div>
              <span>Custo por kg pronto</span>
              <strong>{costPerKgLabel(recipe)}</strong>
              <small>{bookName}</small>
            </div>
          </div>
          {summary}
          {error && <p role="alert">{error}</p>}
          <h3>Composição da ficha</h3>
          {ingredients(true)}
        </EverestPreparation>
      </div>
    </Modal>
  );
}
