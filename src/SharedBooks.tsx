import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChefHat,
  Edit3,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { supabase } from "./supabase";
import { Editor } from "./RecipeEditor";
import { Modal } from "./Modal";
import {
  emptyRecipe,
  totalCost,
  costPerKgLabel,
  itemCost,
  money,
  yieldLabel,
  type Recipe,
} from "./model";
import type { RecipeBook } from "./books-model";
import "./shared-books.css";
export const sharedBooks: RecipeBook[] = [
  {
    id: "linguica",
    title: "Linguiça",
    description: "Cortes, temperos e receitas para a nossa produção.",
    cover: "",
    theme: "orange",
    updated_at: "",
  },
  {
    id: "hamburguer",
    title: "Hamburguer",
    description: "Blends, proporções e o sabor de cada criação.",
    cover: "",
    theme: "ink",
    updated_at: "",
  },
];
const BUCKET = "receita-compartilhada-fotos";
const EDITOR_ID = "7ec10346-2f07-4ec7-93d0-3b1d1ee307ed";
type SharedRecipe = Recipe & { revision: string };
export function SharedBookShelf({
  onOpen,
  query,
}: {
  onOpen: (id: string) => void;
  query: string;
}) {
  return (
    <section className="shared-shelf">
      <div className="shared-shelf-heading">
        <div>
          <span className="eyebrow">REPERTÓRIO DA EQUIPE</span>
          <h2>Livros compartilhados</h2>
        </div>
        <span>
          <Users size={16} /> Acesso para todos os usuários
        </span>
      </div>
      <div className="everest-books">
        {sharedBooks
          .filter((b) =>
            b.title
              .toLocaleLowerCase("pt-BR")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .includes(
                query
                  .toLocaleLowerCase("pt-BR")
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, ""),
              ),
          )
          .map((b, i) => (
            <button
              key={b.id}
              className={`everest-unit-book tone-${i === 0 ? 0 : 2}`}
              aria-label={`Abrir livro ${b.title}`}
              onClick={() => onOpen(b.id)}
            >
              <div className="everest-book-cover">
                <div className="everest-book-top">
                  <span>LE CHEF</span>
                  <ChefHat size={24} />
                </div>
                <div className="everest-book-title">
                  <span>LIVRO COMPARTILHADO</span>
                  <h2>{b.title}</h2>
                </div>
                <div className="everest-book-bottom">
                  <span>RECEITAS DA EQUIPE</span>
                  <BookOpen size={20} />
                </div>
              </div>
              <div className="everest-book-caption">
                <span>Cadastro manual · compartilhado</span>
                <ArrowRight size={18} />
              </div>
            </button>
          ))}
      </div>
    </section>
  );
}
export function SharedBook({
  bookId,
  session,
  onBack,
}: {
  bookId: string;
  session: Session;
  onBack: () => void;
}) {
  const book = sharedBooks.find((b) => b.id === bookId)!;
  const canEdit = session.user.id === EDITOR_ID;
  const [recipes, setRecipes] = useState<SharedRecipe[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState("");
  const [detailTab, setDetailTab] = useState<"technical" | "recipe">(
    "technical",
  );
  const [editor, setEditor] = useState<Recipe | null>(null),
    [detail, setDetail] = useState<SharedRecipe | null>(null),
    [saving, setSaving] = useState(false),
    [photos, setPhotos] = useState<Record<string, string>>({}),
    [zoom, setZoom] = useState<string | null>(null);
  const zoomRef = useRef<HTMLDialogElement>(null),
    mounted = useRef(true);
  const photo = (path: string) => photos[path] || "";
  async function load() {
    setLoading(true);
    setError("");
    try {
      const rows: SharedRecipe[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("receita_compartilhada")
          .select("id,book_slug,content,revision,updated_at")
          .eq("book_slug", bookId)
          .order("updated_at", { ascending: false })
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        rows.push(
          ...data.map(
            (row) =>
              ({
                ...row.content,
                id: row.id,
                book_id: row.book_slug,
                revision: row.revision,
                updated_at: row.updated_at,
              }) as SharedRecipe,
          ),
        );
        if (data.length < 500) break;
      }
      if (!mounted.current) return;
      setRecipes(rows);
      const paths = [
        ...new Set(
          rows
            .flatMap((r) => [r.cover, ...r.steps.map((s) => s.photo)])
            .filter(Boolean),
        ),
      ];
      const urls: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 100) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths.slice(i, i + 100), 3600);
        if (error)
          throw Error(
            "Receitas carregadas, mas não foi possível abrir as fotos. Tente novamente.",
          );
        data.forEach((p) => {
          if (p.path && p.signedUrl) urls[p.path] = p.signedUrl;
        });
      }
      if (mounted.current) setPhotos(urls);
    } catch (e) {
      if (mounted.current)
        setError(
          (e as Error).message || "Não foi possível carregar este livro.",
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [bookId, session.user.id]);
  useEffect(() => {
    if (zoom) zoomRef.current?.showModal();
  }, [zoom]);
  async function save(r: Recipe) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const existing = recipes.find((x) => x.id === r.id);
      const { user_id: _user, book_id: _book, ...content } = r;
      const row = {
        id: r.id,
        book_slug: bookId,
        content,
        revision: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      };
      const result = existing
        ? await supabase
            .from("receita_compartilhada")
            .update(row)
            .eq("id", r.id)
            .eq("revision", existing.revision)
            .select("id")
        : await supabase.from("receita_compartilhada").insert(row).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw Error(
          "A receita foi alterada em outra janela. Copie suas alterações e reabra o livro antes de salvar.",
        );
      setEditor(null);
      setNotice("Receita salva para todos os usuários.");
      await load();
    } catch (e) {
      setError((e as Error).message || "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  async function remove(r: SharedRecipe) {
    if (!confirm(`Excluir “${r.title}” deste livro compartilhado?`)) return;
    setSaving(true);
    setError("");
    try {
      const { data, error } = await supabase
        .from("receita_compartilhada")
        .delete()
        .eq("id", r.id)
        .eq("revision", r.revision)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw Error("A receita mudou. Reabra o livro antes de excluir.");
      setDetail(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const visible = recipes.filter((r) =>
    (r.title + " " + r.description)
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <section className="everest-page shared-book">
      <button className="secondary everest-book-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Todos os livros de ficha técnica
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            LIVRO COMPARTILHADO · LE CHEF
          </div>
          <h1>{book.title}</h1>
          <p>{book.description}</p>
        </div>
        {canEdit && (
          <button
            className="primary"
            onClick={() => setEditor({ ...emptyRecipe(), book_id: bookId })}
          >
            <Plus size={16} />
            Nova receita
          </button>
        )}
      </div>
      <div className="everest-connection">
        <span>
          <Users size={16} /> Todos os usuários cadastrados podem consultar este
          livro.
        </span>
        <span>Receitas cadastradas manualmente</span>
      </div>
      {error && !editor && (
        <div className="everest-error" role="alert">
          {error}
          <button className="secondary" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="shared-notice">
          {notice}
        </p>
      )}
      <div className="everest-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar receitas compartilhadas"
            placeholder="Encontre uma receita neste livro…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{recipes.length} receitas</span>
      </div>
      {loading ? (
        <div className="empty" role="status">
          Abrindo livro…
        </div>
      ) : !visible.length ? (
        <div className="empty">
          <BookOpen size={36} />
          <h3>
            {search
              ? "Nenhuma receita encontrada"
              : "Um novo livro para a sua cozinha."}
          </h3>
          <p>
            {search
              ? "Experimente outro nome."
              : canEdit
                ? "Cadastre a primeira receita. Ela ficará disponível para toda a equipe."
                : "As receitas adicionadas a este livro aparecerão aqui para toda a equipe."}
          </p>
        </div>
      ) : (
        <div className="everest-records">
          {visible.map((r) => (
            <button
              key={r.id}
              className="everest-record"
              onClick={() => {
                setDetailTab("technical");
                setDetail(r);
              }}
              aria-label={`Ver receita ${r.title}`}
            >
              <span className="everest-record-icon">
                {photo(r.cover) ? (
                  <img src={photo(r.cover)} alt="" />
                ) : (
                  <ChefHat size={22} />
                )}
              </span>
              <div className="everest-record-name">
                <span className="everest-code">{r.category}</span>
                <h3>{r.title}</h3>
                <span>
                  {r.ingredients.length} ingredientes · {r.minutes} min
                </span>
              </div>
              <div className="everest-record-yield">
                <span>RENDIMENTO</span>
                <strong>{yieldLabel(r)}</strong>
              </div>
              <div className="everest-record-yield">
                <span>CUSTO TOTAL</span>
                <strong>{money(totalCost(r))}</strong>
              </div>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      )}
      {editor &&
        createPortal(
          <>
            <Editor
              key={editor.id}
              initial={editor}
              books={[book]}
              fixedBook
              uploadBucket={BUCKET}
              session={session}
              photo={photo}
              notify={setError}
              saving={saving}
              onClose={() => {
                setEditor(null);
                setError("");
              }}
              onSave={(r) => void save(r)}
            />
            {error && (
              <div className="toast shared-editor-error" role="alert">
                {error}
                <button aria-label="Fechar aviso" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
          </>,
          document.body,
        )}
      {detail &&
        createPortal(
          <Modal
            wide
            onClose={() => {
              if (!saving) setDetail(null);
            }}
          >
            <div className="detail-content shared-detail">
              <div className="eyebrow">{book.title} · LIVRO COMPARTILHADO</div>
              <h2>{detail.title}</h2>
              <p>{detail.description}</p>
              <div className="detail-actions">
                {canEdit && (
                  <>
                    <button
                      className="primary"
                      disabled={saving}
                      onClick={() => {
                        setEditor(detail);
                        setDetail(null);
                      }}
                    >
                      <Edit3 size={16} />
                      Editar receita
                    </button>
                    <button
                      className="secondary"
                      disabled={saving}
                      onClick={() => void remove(detail)}
                    >
                      <Trash2 size={16} />
                      Excluir receita
                    </button>
                  </>
                )}
              </div>
              <div
                className="shared-detail-tabs"
                role="tablist"
                aria-label="Visualização da ficha"
              >
                {(
                  [
                    { id: "technical", label: "Ficha técnica" },
                    { id: "recipe", label: "Receita" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    id={`shared-${t.id}-tab`}
                    role="tab"
                    aria-selected={detailTab === t.id}
                    aria-controls="shared-detail-panel"
                    tabIndex={detailTab === t.id ? 0 : -1}
                    onClick={() => setDetailTab(t.id)}
                    onKeyDown={(e) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      ) {
                        e.preventDefault();
                        const next =
                          e.key === "Home"
                            ? "technical"
                            : e.key === "End"
                              ? "recipe"
                              : detailTab === "technical"
                                ? "recipe"
                                : "technical";
                        setDetailTab(next);
                        document.getElementById(`shared-${next}-tab`)?.focus();
                      }
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div
                id="shared-detail-panel"
                role="tabpanel"
                aria-labelledby={`shared-${detailTab}-tab`}
              >
                <div
                  className={`detail-summary ${detailTab === "recipe" ? "shared-recipe-summary" : ""}`}
                >
                  {detailTab === "technical" && (
                    <>
                      <div>
                        <span>Custo total</span>
                        <strong>{money(totalCost(detail))}</strong>
                      </div>
                      <div>
                        <span>Custo por kg</span>
                        <strong>{costPerKgLabel(detail)}</strong>
                      </div>
                    </>
                  )}
                  <div>
                    <span>Rendimento</span>
                    <strong>{yieldLabel(detail)}</strong>
                  </div>
                  <div>
                    <span>Preparo</span>
                    <strong>{detail.minutes} min</strong>
                  </div>
                </div>
                {error && <p role="alert">{error}</p>}
                {photo(detail.cover) && (
                  <button
                    className="shared-thumb"
                    aria-label="Ampliar foto do prato"
                    onClick={() => setZoom(photo(detail.cover))}
                  >
                    <img src={photo(detail.cover)} alt="Prato final" />
                  </button>
                )}
                <h3>Ingredientes</h3>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ingrediente</th>
                        <th>Quantidade</th>
                        {detailTab === "technical" && (
                          <>
                            <th>Preço / kg</th>
                            <th>Custo</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ingredients.map((i) => (
                        <tr key={i.id}>
                          <td>{i.name}</td>
                          <td>
                            {i.quantity} {i.unit}
                          </td>
                          {detailTab === "technical" && (
                            <>
                              <td>{money(i.price)}</td>
                              <td>{money(itemCost(i))}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Modo de preparo</h3>
                {detail.steps.map((s, i) => (
                  <div className="shared-step" key={s.id}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <p>{s.text}</p>
                    {photo(s.photo) && (
                      <button
                        className="shared-thumb"
                        aria-label={`Ampliar foto da etapa ${i + 1}`}
                        onClick={() => setZoom(photo(s.photo))}
                      >
                        <img src={photo(s.photo)} alt={`Etapa ${i + 1}`} />
                      </button>
                    )}
                  </div>
                ))}
                {detail.notes && (
                  <div className="notes">
                    <h4>Notas da cozinha</h4>
                    <p>{detail.notes}</p>
                  </div>
                )}
              </div>
            </div>
            {zoom && (
              <dialog
                className="shared-zoom"
                ref={zoomRef}
                onCancel={(e) => {
                  e.preventDefault();
                  setZoom(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setZoom(null);
                  }
                }}
              >
                <button
                  autoFocus
                  aria-label="Fechar foto ampliada"
                  onClick={() => setZoom(null)}
                >
                  <X />
                </button>
                <img src={zoom} alt="Foto ampliada" />
              </dialog>
            )}
          </Modal>,
          document.body,
        )}
    </section>
  );
}
