import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ImagePlus,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Modal } from "./Modal";
import type { RecipeBook } from "./books-model";
import type { Recipe } from "./model";
import { supabase } from "./supabase";
export function BookShelf({
  books,
  recipes,
  photo,
  onOpen,
  onNew,
  onAll,
  onUnfiled,
  demo,
}: {
  books: RecipeBook[];
  recipes: Recipe[];
  photo: (s: string) => string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onAll: () => void;
  onUnfiled: () => void;
  demo: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = books.filter((b) =>
    (b.title + " " + b.description)
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const unfiled = recipes.filter((r) => !r.book_id).length;
  return (
    <section className="books-library">
      <div className="books-intro">
        <div className="eyebrow">A SUA COZINHA TEM MUITAS HISTÓRIAS</div>
        <h2>
          Um universo de sabores.
          <br />
          <em>Um livro para cada um.</em>
        </h2>
        <p>
          Reúna suas receitas por especialidade, inspiração ou ocasião.
          <br />A próxima grande ideia começa em uma página em branco.
        </p>
        <span className="books-intro-mark">✳</span>
        <div className="books-summary">
          <span>
            <strong>{books.length.toString().padStart(2, "0")}</strong> livros
            na estante
          </span>
          <span>
            <strong>{recipes.length.toString().padStart(2, "0")}</strong>{" "}
            receitas para explorar
          </span>
        </div>
      </div>
      <div className="books-toolbar">
        <h2>
          Seus livros <span>{books.length}</span>
        </h2>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar livros"
            placeholder="Encontre um livro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {demo && (
        <p className="books-demo">
          <Sparkles size={14} />
          Livros de exemplo para inspirar a sua coleção.
        </p>
      )}
      <div className="book-grid">
        {filtered.map((b, index) => {
          const own = recipes.filter((r) => r.book_id === b.id),
            cover = photo(b.cover || own.find((r) => r.cover)?.cover || "");
          return (
            <button
              key={b.id}
              className={`book-jacket theme-${b.theme}`}
              aria-label={`Abrir livro ${b.title}`}
              onClick={() => onOpen(b.id)}
              style={{ "--book-index": index } as React.CSSProperties}
            >
              <div className="book-spine" />
              <div className="book-jacket-top">
                <div className="book-volume">
                  LE CHEF{" "}
                  <span>
                    VOL. {String(books.indexOf(b) + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3>{b.title}</h3>
                <p>
                  {b.description ||
                    "Sabores que merecem um lugar na sua estante."}
                </p>
              </div>
              <div className={`book-jacket-image ${cover ? "" : "no-image"}`}>
                {cover ? (
                  <img src={cover} alt="" loading="lazy" />
                ) : (
                  <>
                    <BookOpen size={48} strokeWidth={0.8} />
                    <span>O próximo capítulo é seu.</span>
                  </>
                )}
              </div>
              <div className="book-jacket-bottom">
                <span>
                  {own.length} {own.length === 1 ? "receita" : "receitas"}
                </span>
                <span>
                  Abrir livro <ArrowRight size={16} />
                </span>
              </div>
            </button>
          );
        })}
        <button className="new-book-card" onClick={onNew}>
          <span>
            <Plus size={27} />
          </span>
          <h3>Seu próximo livro</h3>
          <p>
            Uma especialidade, uma viagem,
            <br />
            uma nova inspiração.
          </p>
          <strong>
            Criar novo livro <ArrowRight size={15} />
          </strong>
        </button>
      </div>
      {search && !filtered.length && (
        <p className="books-demo" role="status">
          Nenhum livro encontrado. Experimente outro nome.
        </p>
      )}
      <div className="books-quick-links">
        <button onClick={onAll}>
          <BookOpen size={20} />
          <span>
            <strong>Todas as receitas</strong>
            <small>Explore todo o seu repertório</small>
          </span>
          <b>{recipes.length}</b>
          <ArrowRight size={18} />
        </button>
        <button onClick={onUnfiled}>
          <ImagePlus size={20} />
          <span>
            <strong>Sem livro</strong>
            <small>Receitas esperando seu lugar na estante</small>
          </span>
          <b>{unfiled}</b>
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
export function BookEditor({
  initial,
  session,
  photo,
  onSave,
  onClose,
  saving,
}: {
  initial: RecipeBook;
  session: Session | null;
  photo: (s: string) => string;
  onSave: (b: RecipeBook) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}) {
  const [book, setBook] = useState({ ...initial }),
    [uploading, setUploading] = useState(false),
    [preview, setPreview] = useState(""),
    [error, setError] = useState("");
  const dirty = JSON.stringify(book) !== JSON.stringify(initial);
  const close = () => {
    if (
      !saving &&
      !uploading &&
      (!dirty || confirm("Sair sem salvar as alterações do livro?"))
    )
      onClose();
  };
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > (session ? 10 : 2) * 1024 * 1024
    ) {
      setError(`Use JPG, PNG ou WebP de até ${session ? 10 : 2} MB.`);
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const f = new FileReader();
        f.onload = () => resolve(f.result as string);
        f.onerror = reject;
        f.readAsDataURL(file);
      });
      let path = data;
      if (session) {
        path = `${session.user.id}/books/${book.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
        const result = await supabase.storage
          .from("receita-fotos")
          .upload(path, file);
        if (result.error) throw result.error;
      }
      setPreview(data);
      setBook((b) => ({ ...b, cover: path }));
    } catch {
      setError("Não foi possível enviar a capa. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <Modal onClose={close} wide>
      <form
        className="book-editor"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!book.title.trim()) {
            setError("Dê um nome ao seu livro.");
            return;
          }
          setError("");
          await onSave({ ...book, title: book.title.trim() });
        }}
      >
        <div className="eyebrow">UM NOVO CAPÍTULO NA SUA COZINHA</div>
        <h2>
          {initial.title
            ? "Os detalhes do seu livro."
            : "Dê nome à sua inspiração."}
        </h2>
        <p>Massas, cozinha francesa, receitas de família… a coleção é sua.</p>
        <div className="book-editor-columns">
          <div>
            <label>
              Nome do livro
              <input
                required
                maxLength={100}
                value={book.title}
                placeholder="Ex.: Livro de massas"
                onChange={(e) => setBook({ ...book, title: e.target.value })}
              />
            </label>
            <label>
              Descrição
              <textarea
                maxLength={1000}
                rows={4}
                value={book.description}
                placeholder="O que faz parte deste livro?"
                onChange={(e) =>
                  setBook({ ...book, description: e.target.value })
                }
              />
            </label>
            <fieldset className="book-theme-picker">
              <legend>Personalidade da capa</legend>
              {(["orange", "cream", "ink"] as const).map((theme, i) => (
                <button
                  key={theme}
                  type="button"
                  className={`theme-${theme} ${book.theme === theme ? "chosen" : ""}`}
                  aria-pressed={book.theme === theme}
                  onClick={() => setBook({ ...book, theme })}
                >
                  {book.theme === theme && <Check size={14} />}{" "}
                  {["Laranja", "Branco", "Grafite"][i]}
                </button>
              ))}
            </fieldset>
          </div>
          <div>
            <label className="uploader book-cover-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Foto de capa do livro"
                disabled={uploading || saving}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {book.cover ? (
                <img src={preview || photo(book.cover)} alt="Capa do livro" />
              ) : (
                <>
                  <ImagePlus size={28} />
                  <strong>Uma capa com personalidade.</strong>
                  <span>Escolher foto · opcional</span>
                </>
              )}
            </label>
            {book.cover ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setBook({ ...book, cover: "" });
                  setPreview("");
                }}
              >
                Remover foto de capa
              </button>
            ) : (
              <p className="book-cover-tip">
                Sem foto? Usamos a imagem de uma das receitas do livro.
              </p>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="form-message">
            {error}
          </p>
        )}
        <div className="book-editor-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={saving || uploading}>
            {saving || uploading ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {initial.title ? "Salvar livro" : "Criar livro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
