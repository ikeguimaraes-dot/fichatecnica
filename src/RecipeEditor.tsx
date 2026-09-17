import React, { useEffect, useRef, useState, lazy, Suspense } from "react";

import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Library,
  Pencil,
  Check,
  ChefHat,
  Clock3,
  ClipboardList,
  Cloud,
  Download,
  Grid2X2,
  Heart,
  ImagePlus,
  Leaf,
  List,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Utensils,
  Scale,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  categories,
  costPerKg,
  costPerKgLabel,
  yieldLabel,
  normalizeRecipe,
  emptyRecipe,
  examples,
  itemCost,
  money,
  totalCost,
  type Recipe,
} from "./model";
import { supabase } from "./supabase";

import { Modal } from "./Modal";
import type { RecipeBook } from "./books-model";
export function Editor({
  uploadBucket = "receita-fotos",
  fixedBook = false,
  initial,
  books,
  onClose,
  onSave,
  saving,
  session,
  photo,
  notify,
}: {
  uploadBucket?: string;
  fixedBook?: boolean;
  initial: Recipe;
  books: RecipeBook[];
  onClose: () => void;
  onSave: (r: Recipe) => void;
  saving: boolean;
  session: Session | null;
  photo: (p: string) => string;
  notify: (s: string) => void;
}) {
  const [r, setR] = useState<Recipe>(structuredClone(initial)),
    [tab, setTab] = useState(0),
    [uploading, setUploading] = useState(false),
    [previews, setPreviews] = useState<Record<string, string>>({}),
    [validation, setValidation] = useState("");
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const close = () => {
    if (
      !saving &&
      !uploading &&
      (!dirty ||
        confirm("Você tem alterações não salvas. Deseja sair sem salvar?"))
    )
      onClose();
  };
  const update = (values: Partial<Recipe>) =>
    setR((prev) => ({ ...prev, ...values }));
  async function upload(file: File | undefined, stepId?: string) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      notify("Use uma imagem JPG, PNG ou WebP de até 10 MB.");
      return;
    }
    setUploading(true);
    try {
      let path: string;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (session) {
        path = `${session.user.id}/${r.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
        const { error } = await supabase.storage
          .from(uploadBucket)
          .upload(path, file);
        if (error) throw error;
        setPreviews((p) => ({ ...p, [path]: data }));
      } else {
        if (file.size > 2 * 1024 * 1024)
          throw new Error(
            "No modo demonstração, use fotos de até 2 MB. Entre para enviar fotos maiores.",
          );
        path = data;
      }
      setR((prev) =>
        stepId
          ? {
              ...prev,
              steps: prev.steps.map((s) =>
                s.id === stepId
                  ? {
                      ...s,
                      photo: path,
                      ...(s.photos
                        ? { photos: [path, ...s.photos.slice(1)] }
                        : {}),
                    }
                  : s,
              ),
            }
          : { ...prev, cover: path },
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Não foi possível enviar a foto.",
      );
    } finally {
      setUploading(false);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!r.title.trim()) {
      setTab(0);
      setValidation("Dê um nome à sua receita.");
      return;
    }
    if (
      typeof r.yield_kg !== "number" ||
      !Number.isFinite(r.yield_kg) ||
      r.yield_kg <= 0 ||
      r.yield_kg > 10000 ||
      !Number.isInteger(r.minutes) ||
      r.minutes < 0 ||
      r.minutes > 100000
    ) {
      setTab(0);
      setValidation(
        "Informe o rendimento final em kg, maior que zero e até 10.000 kg, e um tempo válido.",
      );
      return;
    }
    if (
      !r.ingredients.length ||
      r.ingredients.some(
        (i) =>
          !i.name.trim() ||
          !Number.isFinite(i.quantity) ||
          i.quantity <= 0 ||
          !Number.isFinite(i.price) ||
          i.price < 0,
      )
    ) {
      setTab(1);
      setValidation(
        "Preencha o nome, uma quantidade maior que zero e o preço de cada ingrediente.",
      );
      return;
    }
    if (r.steps.some((s) => !s.text.trim())) {
      setTab(2);
      setValidation("Descreva cada etapa ou remova as etapas vazias.");
      return;
    }
    setValidation("");
    onSave({ ...r, title: r.title.trim() });
  }
  const uploader = (value: string, stepId?: string) => (
    <label className={`uploader ${value ? "has-image" : ""}`}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={
          stepId ? "Adicionar foto da etapa" : "Adicionar foto principal"
        }
        disabled={uploading || saving}
        onChange={(e) => {
          upload(e.target.files?.[0], stepId);
          e.target.value = "";
        }}
      />
      {value ? (
        <>
          <img
            src={previews[value] || photo(value)}
            alt={stepId ? "Foto da etapa" : "Foto principal"}
          />
          <span>
            <ImagePlus size={17} />
            Trocar foto
          </span>
        </>
      ) : (
        <>
          <ImagePlus size={28} />
          <strong>
            {stepId ? "Fotografe este momento" : "O prato começa pelos olhos."}
          </strong>
          <span>
            {stepId
              ? "Adicionar foto da etapa"
              : "Clique para escolher a foto principal"}
          </span>
          <small>JPG, PNG ou WebP · até 10 MB</small>
        </>
      )}
    </label>
  );
  return (
    <Modal onClose={close} wide>
      <form className="editor" onSubmit={submit}>
        <div className="editor-header">
          <div className="eyebrow">DO SEU REPERTÓRIO PARA O MUNDO</div>
          <h2>
            {initial.title ? "Aperfeiçoe sua receita." : "Uma nova criação."}
          </h2>
          <p>Cada detalhe faz parte do sabor.</p>
        </div>
        <div className="editor-tabs">
          {["O prato", "Ingredientes", "Modo de preparo"].map((t, i) => (
            <button
              type="button"
              key={t}
              className={tab === i ? "active" : ""}
              onClick={() => setTab(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {t}
            </button>
          ))}
        </div>
        <div className="editor-body">
          {tab === 0 && (
            <div className="dish-fields">
              <div>
                <label>
                  Nome do prato
                  <input
                    value={r.title}
                    maxLength={160}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="Como se chama sua criação?"
                  />
                </label>
                <label>
                  Uma breve descrição
                  <textarea
                    value={r.description}
                    maxLength={2000}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Sabores, texturas e o que torna este prato especial..."
                    rows={3}
                  />
                </label>
                <label>
                  Livro de receitas
                  <select
                    aria-label="Livro de receitas"
                    disabled={fixedBook}
                    value={r.book_id || ""}
                    onChange={(e) =>
                      update({ book_id: e.target.value || null })
                    }
                  >
                    {!fixedBook && <option value="">Sem livro</option>}
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Categoria
                  <select
                    value={r.category}
                    onChange={(e) => update({ category: e.target.value })}
                  >
                    {categories.slice(1).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <p id="yield-help" className="yield-help">
                  Peso final da receita pronta, sempre em kg. Ex.: 500 g = 0,5
                  kg.
                </p>
                <div className="field-row">
                  <label>
                    Rendimento final (kg)
                    <input
                      aria-describedby="yield-help"
                      type="number"
                      required
                      min={0}
                      step="any"
                      max={10000}
                      placeholder="Ex.: 0,5 ou 2,5"
                      aria-label="Rendimento final (kg)"
                      value={r.yield_kg ?? ""}
                      onChange={(e) =>
                        update({
                          yield_kg:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Preparo (minutos)
                    <input
                      type="number"
                      required
                      min={0}
                      max={100000}
                      value={r.minutes}
                      onChange={(e) =>
                        update({ minutes: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              </div>
              <div>
                {uploader(r.cover)}
                {r.cover && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => update({ cover: "" })}
                  >
                    Remover foto
                  </button>
                )}
                <div className="photo-tip">
                  <Sparkles size={16} />
                  <p>
                    Use luz natural e mostre a finalização. Esta será a capa da
                    sua receita.
                  </p>
                </div>
              </div>
            </div>
          )}
          {tab === 1 && (
            <>
              <div className="section-intro">
                <h3>A medida de cada sabor.</h3>
                <p>
                  Informe a quantidade usada e o preço por quilo. O custo é
                  calculado na hora.
                </p>
              </div>
              <div className="ingredient-table">
                <div className="ingredient-head">
                  <span>INGREDIENTE</span>
                  <span>QUANTIDADE</span>
                  <span>UNIDADE</span>
                  <span>PREÇO / KG</span>
                  <span>CUSTO</span>
                  <span />
                </div>
                {r.ingredients.map((item, index) => (
                  <div className="ingredient-row" key={item.id}>
                    <input
                      aria-label={`Ingrediente ${index + 1}`}
                      placeholder="Ex.: Farinha de trigo"
                      value={item.name}
                      onChange={(e) =>
                        update({
                          ingredients: r.ingredients.map((i) =>
                            i.id === item.id
                              ? { ...i, name: e.target.value }
                              : i,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Quantidade ${index + 1}`}
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity || ""}
                      placeholder="0"
                      onChange={(e) =>
                        update({
                          ingredients: r.ingredients.map((i) =>
                            i.id === item.id
                              ? { ...i, quantity: Number(e.target.value) }
                              : i,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={`Unidade ${index + 1}`}
                      value={item.unit}
                      onChange={(e) =>
                        update({
                          ingredients: r.ingredients.map((i) =>
                            i.id === item.id
                              ? { ...i, unit: e.target.value as "g" | "kg" }
                              : i,
                          ),
                        })
                      }
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                    <input
                      aria-label={`Preço por kg ${index + 1}`}
                      type="number"
                      min={0}
                      step="any"
                      value={item.price || ""}
                      placeholder="0,00"
                      onChange={(e) =>
                        update({
                          ingredients: r.ingredients.map((i) =>
                            i.id === item.id
                              ? { ...i, price: Number(e.target.value) }
                              : i,
                          ),
                        })
                      }
                    />
                    <strong>{money(itemCost(item))}</strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remover ingrediente ${index + 1}`}
                      onClick={() =>
                        update({
                          ingredients: r.ingredients.filter(
                            (i) => i.id !== item.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="add-button"
                onClick={() =>
                  update({
                    ingredients: [
                      ...r.ingredients,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        quantity: 0,
                        unit: "g",
                        price: 0,
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Adicionar ingrediente
              </button>
              <div className="cost-explainer">
                <Leaf size={18} />
                <span>
                  Precisão que faz diferença.{" "}
                  <strong>250 g × R$ 40,00/kg = R$ 10,00.</strong>
                </span>
              </div>
            </>
          )}
          {tab === 2 && (
            <>
              <div className="section-intro">
                <h3>O caminho até o prato.</h3>
                <p>
                  Registre o passo a passo e os detalhes que fazem a diferença.
                </p>
              </div>
              {r.steps.map((s, index) => (
                <div className="step-editor" key={s.id}>
                  <span className="step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <label>
                      Etapa {index + 1}
                      <textarea
                        value={s.text}
                        onChange={(e) =>
                          update({
                            steps: r.steps.map((x) =>
                              x.id === s.id
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          })
                        }
                        placeholder="Descreva o que fazer nesta etapa..."
                        rows={4}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        update({ steps: r.steps.filter((x) => x.id !== s.id) })
                      }
                    >
                      Remover etapa
                    </button>
                  </div>
                  <div>
                    {uploader(s.photo, s.id)}
                    {s.photo && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          update({
                            steps: r.steps.map((x) =>
                              x.id === s.id ? { ...x, photo: "" } : x,
                            ),
                          })
                        }
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="add-button"
                onClick={() =>
                  update({
                    steps: [
                      ...r.steps,
                      { id: crypto.randomUUID(), text: "", photo: "" },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Adicionar etapa
              </button>
              <label className="notes-field">
                Notas da cozinha
                <textarea
                  value={r.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="Dicas de finalização, armazenamento ou substituições..."
                  rows={3}
                />
              </label>
            </>
          )}
          {validation && (
            <p className="form-message" role="alert">
              {validation}
            </p>
          )}
          {uploading && (
            <p className="form-message">
              <LoaderCircle className="spin" size={14} /> Enviando sua foto...
            </p>
          )}
        </div>
        <div className="editor-footer">
          <div>
            <span>CUSTO TOTAL DO PRATO</span>
            <strong data-testid="editor-total">{money(totalCost(r))}</strong>
            <small>
              {costPerKg(r) === null
                ? "Informe o rendimento em kg"
                : `${costPerKgLabel(r)} / kg`}
            </small>
          </div>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => (tab > 0 ? setTab(tab - 1) : close())}
            >
              <ArrowLeft size={16} />
              {tab > 0 ? "Voltar" : "Cancelar"}
            </button>
            {tab < 2 ? (
              <button
                type="button"
                className="primary"
                onClick={() => setTab(tab + 1)}
              >
                Continuar
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="primary" disabled={saving || uploading}>
                {saving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Salvar receita
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
