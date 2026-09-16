import React, { useEffect, useRef, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
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
import "./style.css";
import { Modal } from "./Modal";
const Everest = lazy(() =>
  import("./Everest").then((m) => ({ default: m.Everest })),
);
import { BookShelf, BookEditor } from "./Books";
import { demoBooks, emptyBook, type RecipeBook } from "./books-model";
const localKey = "mise-demo-v1";
function readDemo(): Recipe[] {
  try {
    const saved: Recipe[] =
      JSON.parse(localStorage.getItem(localKey) || "null") || examples;
    const availableBooks = readBooks();
    return saved.map(normalizeRecipe).map((r) => {
      if (r.book_id !== undefined) return r;
      const suggested = examples.find((x) => x.id === r.id)?.book_id;
      return {
        ...r,
        book_id: availableBooks.some((b) => b.id === suggested)
          ? suggested
          : null,
      };
    });
  } catch {
    return examples;
  }
}
const booksKey = "le-chef-books-v1";
function readBooks(): RecipeBook[] {
  try {
    return JSON.parse(localStorage.getItem(booksKey) || "null") || demoBooks;
  } catch {
    return demoBooks;
  }
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [recipes, setRecipes] = useState<Recipe[]>(readDemo),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [category, setCategory] = useState(categories[0]),
    [search, setSearch] = useState(""),
    [nav, setNav] = useState("books"),
    [list, setList] = useState(false),
    [sort, setSort] = useState("recent");
  const [editor, setEditor] = useState<Recipe | null>(null),
    [detail, setDetail] = useState<Recipe | null>(null),
    [auth, setAuth] = useState(false),
    [recovery, setRecovery] = useState(false),
    [toast, setToast] = useState(""),
    [saving, setSaving] = useState(false);
  const [books, setBooks] = useState<RecipeBook[]>(readBooks);
  const [activeBook, setActiveBook] = useState<string | null>(null);
  const [bookEditor, setBookEditor] = useState<RecipeBook | null>(null);
  const [bookSaving, setBookSaving] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);
  const currentBook = books.find((b) => b.id === activeBook);
  const navigate = (view: string, bookId: string | null = null) => {
    setNav(view);
    setActiveBook(bookId);
    setSearch("");
    setCategory(categories[0]);
  };
  const createRecipe = () =>
    setEditor({ ...emptyRecipe(), book_id: currentBook?.id || null });
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const notify = (text: string) => setToast(text);
  const activeUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (_event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setAuth(true);
      }
      if (activeUser.current !== s?.user.id) {
        setEditor(null);
        setDetail(null);
        setBookEditor(null);
        setActiveBook(null);
        setOrganizing(false);
        activeUser.current = s?.user.id;
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    if (!session) {
      setRecipes(readDemo());
      setBooks(readBooks());
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("receita")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabase
        .from("receita_livro")
        .select("*")
        .order("created_at", { ascending: true }),
    ]).then(([recipeResult, bookResult]) => {
      if (!active) return;
      if (recipeResult.error || bookResult.error) {
        setError(
          "Não foi possível carregar a biblioteca. Verifique sua conexão e tente novamente.",
        );
        setRecipes([]);
        setBooks([]);
      } else {
        setRecipes((recipeResult.data as Recipe[]).map(normalizeRecipe));
        setBooks(bookResult.data as RecipeBook[]);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    let active = true;
    const paths = [
      ...new Set(
        [
          ...recipes.flatMap((r) => [r.cover, ...r.steps.map((s) => s.photo)]),
          ...books.map((b) => b.cover),
        ].filter((p) => p && !/^(https?:|data:)/.test(p)),
      ),
    ];
    if (paths.length)
      supabase.storage
        .from("receita-fotos")
        .createSignedUrls(paths, 86400)
        .then(({ data }) => {
          if (active && data)
            setPhotoUrls(
              Object.fromEntries(
                data
                  .filter((x) => x.signedUrl)
                  .map((x) => [x.path!, x.signedUrl!]),
              ),
            );
        });
    return () => {
      active = false;
    };
  }, [recipes, books]);
  const photo = (p: string) =>
    /^(https?:|data:|blob:)/.test(p) ? p : photoUrls[p] || "";
  async function persist(recipe: Recipe) {
    const next = {
      ...normalizeRecipe(recipe),
      updated_at: new Date().toISOString(),
    };
    if (session) {
      const { error } = await supabase
        .from("receita")
        .upsert({ ...next, user_id: session.user.id });
      if (error) throw error;
    } else {
      const nextRecipes = [next, ...recipes.filter((r) => r.id !== next.id)];
      localStorage.setItem(localKey, JSON.stringify(nextRecipes));
    }
    setRecipes((prev) => [next, ...prev.filter((r) => r.id !== next.id)]);
  }
  async function save(recipe: Recipe) {
    setSaving(true);
    try {
      await persist(recipe);
      setEditor(null);
      notify(
        session
          ? "Ficha salva na sua biblioteca."
          : "Ficha salva neste navegador, no modo demonstração.",
      );
    } catch {
      notify(
        "Não foi possível salvar. Sua ficha continua aberta para tentar novamente.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function favorite(r: Recipe) {
    try {
      await persist({ ...r, favorite: !r.favorite });
    } catch {
      notify("Não foi possível atualizar o favorito.");
    }
  }
  async function remove(r: Recipe) {
    if (!confirm(`Excluir “${r.title}”? Esta ação não pode ser desfeita.`))
      return;
    try {
      if (session) {
        const { error } = await supabase
          .from("receita")
          .delete()
          .eq("id", r.id);
        if (error) throw error;
      } else
        localStorage.setItem(
          localKey,
          JSON.stringify(recipes.filter((x) => x.id !== r.id)),
        );
      setRecipes((prev) => prev.filter((x) => x.id !== r.id));
      setDetail(null);
      notify("Ficha excluída.");
    } catch {
      notify("Não foi possível excluir. Tente novamente.");
    }
  }
  async function saveBook(book: RecipeBook) {
    setBookSaving(true);
    try {
      const next = { ...book, updated_at: new Date().toISOString() };
      if (session) {
        const { error } = await supabase
          .from("receita_livro")
          .upsert({ ...next, user_id: session.user.id });
        if (error) throw error;
      } else
        localStorage.setItem(
          booksKey,
          JSON.stringify([...books.filter((b) => b.id !== next.id), next]),
        );
      setBooks((prev) =>
        prev.some((b) => b.id === next.id)
          ? prev.map((b) => (b.id === next.id ? next : b))
          : [...prev, next],
      );
      setBookEditor(null);
      navigate("book", next.id);
      notify("Livro salvo. Seu próximo capítulo começa aqui.");
    } catch {
      notify("Não foi possível salvar o livro. Tente novamente.");
    } finally {
      setBookSaving(false);
    }
  }
  async function deleteBook(book: RecipeBook) {
    if (
      !confirm(
        `Excluir o livro “${book.title}”? As receitas serão preservadas em “Sem livro”.`,
      )
    )
      return;
    try {
      if (session) {
        const { error } = await supabase
          .from("receita_livro")
          .delete()
          .eq("id", book.id);
        if (error) throw error;
      }
      const remaining = books.filter((b) => b.id !== book.id),
        updated = recipes.map((r) =>
          r.book_id === book.id ? { ...r, book_id: null } : r,
        );
      if (!session) {
        localStorage.setItem(booksKey, JSON.stringify(remaining));
        localStorage.setItem(localKey, JSON.stringify(updated));
      }
      setBooks(remaining);
      setRecipes(updated);
      navigate("books");
      notify("Livro excluído. Suas receitas foram preservadas.");
    } catch {
      notify("Não foi possível excluir o livro. Tente novamente.");
    }
  }
  async function moveRecipes() {
    if (!currentBook || !selectedRecipes.length) return;
    setMoving(true);
    try {
      if (session) {
        const { error } = await supabase
          .from("receita")
          .update({
            book_id: currentBook.id,
            updated_at: new Date().toISOString(),
          })
          .in("id", selectedRecipes);
        if (error) throw error;
      }
      const updated = recipes.map((r) =>
        selectedRecipes.includes(r.id) ? { ...r, book_id: currentBook.id } : r,
      );
      if (!session) localStorage.setItem(localKey, JSON.stringify(updated));
      setRecipes(updated);
      setOrganizing(false);
      setSelectedRecipes([]);
      notify("Receitas adicionadas ao livro.");
    } catch {
      notify("Não foi possível mover as receitas. Tente novamente.");
    } finally {
      setMoving(false);
    }
  }
  const filtered = recipes
    .filter(
      (r) =>
        (nav !== "book" ||
          !activeBook ||
          (activeBook === "unfiled" ? !r.book_id : r.book_id === activeBook)) &&
        (category === categories[0] || r.category === category) &&
        (nav !== "favorites" || r.favorite) &&
        `${r.title} ${r.ingredients.map((i) => i.name).join(" ")}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "cost"
          ? (costPerKg(a) ?? Infinity) - (costPerKg(b) ?? Infinity)
          : b.updated_at.localeCompare(a.updated_at),
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("books");
          }}
        >
          Le Chef<span>✳</span>
        </a>
        <div className="brand-caption">CADA DETALHE NO LUGAR.</div>
        <div className="workspace">
          <div className="workspace-icon">
            <ChefHat size={20} />
          </div>
          <div>
            <strong>Minha cozinha</strong>
            <span>Seu espaço de criação</span>
          </div>
          <span className="small-dot" />
        </div>
        <div className="nav-label">BIBLIOTECA</div>
        <nav>
          <button
            className={
              nav === "books" || (nav === "book" && !!activeBook)
                ? "active"
                : ""
            }
            onClick={() => navigate("books")}
          >
            <Library size={19} />
            Meus livros <span>{books.length.toString().padStart(2, "0")}</span>
          </button>
          <button
            className={nav === "book" && !activeBook ? "active" : ""}
            onClick={() => navigate("book")}
          >
            <BookOpen size={19} />
            Todas as receitas{" "}
            <span>{recipes.length.toString().padStart(2, "0")}</span>
          </button>
          <button
            className={nav === "technical" ? "active" : ""}
            onClick={() => navigate("technical")}
          >
            <ClipboardList size={19} />
            Ficha técnica
          </button>
          <button
            className={nav === "favorites" ? "active" : ""}
            onClick={() => navigate("favorites")}
          >
            <Heart size={19} />
            Favoritas{" "}
            <span>
              {recipes
                .filter((r) => r.favorite)
                .length.toString()
                .padStart(2, "0")}
            </span>
          </button>
          <button
            className={nav === "costs" ? "active" : ""}
            onClick={() => navigate("costs")}
          >
            <SlidersHorizontal size={19} />
            Visão de custos
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="note-star">✳</span>
          <h3>
            Boas receitas merecem
            <br />
            ser lembradas.
          </h3>
          <p>Transforme o saber da sua cozinha em um legado.</p>
          <div className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <div className="status">
            <span className="small-dot" />
            {session ? "Biblioteca conectada" : "Modo demonstração"}
          </div>
          <button
            className="account"
            onClick={() => (session ? supabase.auth.signOut() : setAuth(true))}
          >
            <span className="avatar">{session ? "MC" : "LC"}</span>
            <span>
              <strong>
                {session ? "Minha conta" : "Entre na sua cozinha"}
              </strong>
              <small>
                {session ? session.user.email : "Salve suas fichas na nuvem"}
              </small>
            </span>
            {session ? <LogOut size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="breadcrumb">Minha cozinha</span>
            <span className="slash">/</span>
            {nav === "technical"
              ? "Ficha técnica"
              : nav === "favorites"
                ? "Favoritas"
                : nav === "costs"
                  ? "Visão de custos"
                  : nav === "books"
                    ? "Meus livros"
                    : currentBook?.title ||
                      (activeBook === "unfiled"
                        ? "Sem livro"
                        : "Todas as receitas")}
          </div>
          <div className="topbar-right">
            <span>
              <span className="small-dot" />
              {session ? "Tudo no seu lugar" : "Explore. Experimente. Crie."}
            </span>
            <button
              className="avatar"
              aria-label="Abrir conta"
              onClick={() => setAuth(true)}
            >
              LC
            </button>
          </div>
        </header>
        <div className="main-content">
          {nav === "book" && activeBook && (
            <div className="book-back-row">
              <button onClick={() => navigate("books")}>
                <ArrowLeft size={15} />
                Voltar aos livros
              </button>
              {currentBook && (
                <div>
                  <button onClick={() => setBookEditor(currentBook)}>
                    <Pencil size={14} />
                    Editar livro
                  </button>
                  <button
                    aria-label="Excluir livro"
                    onClick={() => deleteBook(currentBook)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          )}
          {nav === "technical" ? (
            <Suspense
              fallback={
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <p>Abrindo fichas técnicas…</p>
                </div>
              }
            >
              <Everest
                key={session?.user.id || "guest"}
                session={session}
                onLogin={() => setAuth(true)}
              />
            </Suspense>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> SEU REPERTÓRIO GASTRONÔMICO
                  </div>
                  <h1>
                    {nav === "books" ? (
                      <>
                        Sua cozinha, <em>em volumes.</em>
                      </>
                    ) : currentBook ? (
                      currentBook.title
                    ) : activeBook === "unfiled" ? (
                      "Receitas sem livro."
                    ) : nav === "favorites" ? (
                      "Receitas do coração."
                    ) : nav === "costs" ? (
                      "Precisão em cada prato."
                    ) : (
                      <>
                        Sua cozinha, <em>em páginas.</em>
                      </>
                    )}
                  </h1>
                  <p>
                    {nav === "books"
                      ? "Uma estante de ideias. Infinitas possibilidades à mesa."
                      : currentBook
                        ? currentBook.description ||
                          "Cada receita é um novo capítulo."
                        : activeBook === "unfiled"
                          ? "Abra uma receita para escolher o livro onde ela vai morar."
                          : "Guarde o que torna cada prato único. Crie, organize e inspire."}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={
                    nav === "books"
                      ? () => setBookEditor(emptyBook())
                      : createRecipe
                  }
                >
                  <Plus size={18} />
                  {nav === "books" ? "Novo livro" : "Nova receita"}
                </button>
              </section>
              {nav === "books" ? (
                error ? (
                  <div className="empty">
                    <Cloud />
                    <p>{error}</p>
                    <button
                      className="primary"
                      onClick={() => location.reload()}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : loading ? (
                  <div className="empty">
                    <LoaderCircle className="spin" />
                    <p>Abrindo sua biblioteca...</p>
                  </div>
                ) : (
                  <BookShelf
                    books={books}
                    recipes={recipes}
                    photo={photo}
                    onOpen={(id) => navigate("book", id)}
                    onNew={() => setBookEditor(emptyBook())}
                    onAll={() => navigate("book")}
                    onUnfiled={() => navigate("book", "unfiled")}
                    demo={!session}
                  />
                )
              ) : (
                <>
                  {nav === "book" && !activeBook && (
                    <section className="hero">
                      <div className="hero-content">
                        <span className="hero-label">
                          <span /> A ARTE DE FAZER BEM
                        </span>
                        <h2>
                          O ingrediente secreto
                          <br />é o <em>cuidado.</em>
                        </h2>
                        <p>
                          Da primeira medida ao último toque.
                          <br />
                          Cada receita, uma história bem contada.
                        </p>
                        <button onClick={createRecipe}>
                          Dê vida à sua próxima criação <ArrowRight size={18} />
                        </button>
                        <div className="hero-bottom">
                          <span>O SABOR ESTÁ NOS DETALHES.</span>
                          <Leaf size={20} />
                        </div>
                      </div>
                      <div className="hero-image">
                        <img
                          src="https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1400&q=90"
                          alt="Salmão dourado com vegetais frescos em prato de cerâmica"
                        />
                        <div className="image-shade" />
                        <div className="hero-stamp">
                          FEITO COM
                          <br />
                          <Heart size={21} />
                          <br />
                          INTENÇÃO
                        </div>
                        <div className="hero-image-caption">
                          <span>INSPIRAÇÃO DO DIA</span>
                          <strong>O extraordinário está nos detalhes.</strong>
                        </div>
                      </div>
                    </section>
                  )}
                  {currentBook && (
                    <div className="book-context-actions">
                      <span>
                        <BookOpen size={16} />
                        {
                          recipes.filter((r) => r.book_id === currentBook.id)
                            .length
                        }{" "}
                        receitas neste livro
                      </span>
                      <button
                        className="secondary"
                        onClick={() => {
                          setSelectedRecipes([]);
                          setOrganizing(true);
                        }}
                      >
                        <Plus size={15} />
                        Adicionar receitas existentes
                      </button>
                    </div>
                  )}
                  <section className="stats">
                    <div>
                      <div className="stat-icon">
                        <BookOpen size={21} />
                      </div>
                      <div>
                        <span>Receitas na biblioteca</span>
                        <strong>
                          {recipes.length.toString().padStart(2, "0")}
                          <small>criações da sua cozinha</small>
                        </strong>
                      </div>
                    </div>
                    <div>
                      <div className="stat-icon">
                        <Utensils size={21} />
                      </div>
                      <div>
                        <span>Categorias exploradas</span>
                        <strong>
                          {new Set(recipes.map((r) => r.category)).size
                            .toString()
                            .padStart(2, "0")}
                          <small>possibilidades à mesa</small>
                        </strong>
                      </div>
                    </div>
                    <div>
                      <div className="stat-icon">
                        <Heart size={21} />
                      </div>
                      <div>
                        <span>Receitas favoritas</span>
                        <strong>
                          {recipes
                            .filter((r) => r.favorite)
                            .length.toString()
                            .padStart(2, "0")}
                          <small>para fazer de novo</small>
                        </strong>
                      </div>
                    </div>
                  </section>
                  <section className="library">
                    <div className="library-heading">
                      <h2>
                        {nav === "favorites"
                          ? "Suas favoritas"
                          : nav === "costs"
                            ? "Custos por receita"
                            : currentBook
                              ? "Receitas deste livro"
                              : activeBook === "unfiled"
                                ? "Receitas sem livro"
                                : "Todas as receitas"}
                        <span>{filtered.length}</span>
                      </h2>
                      <div className="view-switch">
                        <button
                          className={!list ? "selected" : ""}
                          aria-label="Visualização em grade"
                          onClick={() => setList(false)}
                        >
                          <Grid2X2 size={17} />
                        </button>
                        <button
                          className={list ? "selected" : ""}
                          aria-label="Visualização em lista"
                          onClick={() => setList(true)}
                        >
                          <List size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="library-controls">
                      <div className="search">
                        <Search size={18} />
                        <input
                          aria-label="Buscar receitas"
                          placeholder="Busque uma receita ou ingrediente..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                          <button
                            aria-label="Limpar busca"
                            onClick={() => setSearch("")}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      <label className="sort">
                        <ArrowDownWideNarrow size={17} />
                        <select
                          aria-label="Ordenar receitas"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="recent">Mais recentes</option>
                          <option value="name">Nome: A a Z</option>
                          <option value="cost">Menor custo por kg</option>
                        </select>
                      </label>
                    </div>
                    <div className="categories">
                      {categories.map((c) => (
                        <button
                          key={c}
                          className={category === c ? "selected" : ""}
                          onClick={() => setCategory(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {!session && (
                      <div className="demo-note">
                        <Sparkles size={14} /> Uma amostra para inspirar.{" "}
                        <button onClick={() => setAuth(true)}>
                          Entre para criar sua biblioteca pessoal{" "}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                    {error ? (
                      <div className="empty">
                        <Cloud />
                        <h3>Vamos reconectar?</h3>
                        <p>{error}</p>
                        <button
                          className="primary"
                          onClick={() => location.reload()}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    ) : loading ? (
                      <div className="empty">
                        <LoaderCircle className="spin" />
                        <p>Abrindo seu livro...</p>
                      </div>
                    ) : !filtered.length ? (
                      <div className="empty">
                        <BookOpen size={36} />
                        <h3>
                          {search
                            ? "Ainda não encontramos essa receita."
                            : "Toda cozinha começa com uma receita."}
                        </h3>
                        <p>
                          {search
                            ? "Experimente outro nome ou ingrediente."
                            : "Adicione sua primeira criação e deixe cada detalhe registrado."}
                        </p>
                        <button
                          className="primary"
                          onClick={() =>
                            search ? setSearch("") : createRecipe()
                          }
                        >
                          {search
                            ? "Limpar busca"
                            : "Criar minha primeira receita"}
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`recipe-grid ${list || nav === "costs" ? "list-view" : ""}`}
                      >
                        {filtered.map((r, index) => (
                          <article
                            className="recipe-card"
                            key={r.id}
                            style={{ "--i": index } as React.CSSProperties}
                          >
                            <button
                              className="card-photo"
                              onClick={() => setDetail(r)}
                              aria-label={`Ver ${r.title}`}
                            >
                              {photo(r.cover) ? (
                                <img
                                  src={photo(r.cover)}
                                  alt={r.title}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="photo-placeholder">
                                  <ChefHat size={40} />
                                </div>
                              )}
                              <span className="card-category">
                                {r.category}
                              </span>
                            </button>
                            <button
                              className={`favorite ${r.favorite ? "is-favorite" : ""}`}
                              aria-label={`${r.favorite ? "Desfavoritar" : "Favoritar"} ${r.title}`}
                              onClick={() => favorite(r)}
                            >
                              <Heart
                                size={17}
                                fill={r.favorite ? "currentColor" : "none"}
                              />
                            </button>
                            <div className="card-body">
                              <button
                                className="card-title"
                                onClick={() => setDetail(r)}
                              >
                                {r.title}
                              </button>
                              <div className="card-meta">
                                <span>
                                  <Clock3 size={13} />
                                  {r.minutes} min
                                </span>
                                <span className="meta-dot">·</span>
                                <span>
                                  <Scale size={13} />
                                  {yieldLabel(r)}
                                </span>
                              </div>
                              <div className="card-footer">
                                <div>
                                  <span>CUSTO POR KG</span>
                                  <strong>{costPerKgLabel(r)}</strong>
                                </div>
                                <button
                                  aria-label={`Abrir ficha de ${r.title}`}
                                  onClick={() => setDetail(r)}
                                >
                                  <ArrowRight size={18} />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span className="footer-brand">
              Le Chef<span>✳</span>
            </span>
            <span>Receitas com alma. Gestão com precisão.</span>
            <span>FEITO PARA A SUA COZINHA</span>
          </footer>
        </div>
      </main>
      {bookEditor && (
        <BookEditor
          initial={bookEditor}
          session={session}
          photo={photo}
          onSave={saveBook}
          onClose={() => setBookEditor(null)}
          saving={bookSaving}
        />
      )}
      {organizing && currentBook && (
        <Modal
          onClose={() => {
            if (!moving) setOrganizing(false);
          }}
        >
          <div className="organize-recipes">
            <div className="eyebrow">COMPONHA SEU LIVRO</div>
            <h2>Adicionar receitas</h2>
            <p>
              Selecione as receitas para mover para{" "}
              <strong>{currentBook.title}</strong>. Elas sairão do livro
              anterior.
            </p>
            <div className="organize-list">
              {recipes
                .filter((r) => r.book_id !== currentBook.id)
                .map((r) => (
                  <label key={r.id}>
                    <input
                      type="checkbox"
                      checked={selectedRecipes.includes(r.id)}
                      onChange={(e) =>
                        setSelectedRecipes((prev) =>
                          e.target.checked
                            ? [...prev, r.id]
                            : prev.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span>
                      <strong>{r.title}</strong>
                      <small>
                        {books.find((b) => b.id === r.book_id)?.title ||
                          "Sem livro"}
                      </small>
                    </span>
                  </label>
                ))}
              {!recipes.some((r) => r.book_id !== currentBook.id) && (
                <p>
                  Não há outras receitas para adicionar. Crie uma nova receita
                  neste livro.
                </p>
              )}
            </div>
            <button
              className="primary"
              disabled={moving || !selectedRecipes.length}
              onClick={moveRecipes}
            >
              {moving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Mover {selectedRecipes.length} receitas
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <Editor
          key={editor.id}
          initial={editor}
          books={books}
          onClose={() => setEditor(null)}
          onSave={save}
          saving={saving}
          session={session}
          photo={photo}
          notify={notify}
        />
      )}
      {detail && (
        <Modal onClose={() => setDetail(null)} wide>
          <div className="detail-cover">
            {photo(detail.cover) && (
              <img src={photo(detail.cover)} alt={detail.title} />
            )}
            <span className="pill">{detail.category}</span>
          </div>
          <div className="detail-content">
            <div className="eyebrow">RECEITA · LE CHEF</div>
            <h2>{detail.title}</h2>
            <p>{detail.description}</p>
            <p className="detail-book-label">
              <BookOpen size={14} />
              {books.find((b) => b.id === detail.book_id)?.title || "Sem livro"}
            </p>
            <div className="detail-actions">
              <button
                className="primary"
                onClick={() => {
                  setEditor(detail);
                  setDetail(null);
                }}
              >
                Editar receita <ArrowRight size={16} />
              </button>
              <button className="secondary" onClick={() => window.print()}>
                <Download size={16} />
                Imprimir / PDF
              </button>
              <button
                className="icon-button danger"
                aria-label="Excluir receita"
                onClick={() => remove(detail)}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <div className="detail-summary">
              <div>
                <span>Custo total</span>
                <strong>{money(totalCost(detail))}</strong>
              </div>
              <div>
                <span>Custo por kg</span>
                <strong>{costPerKgLabel(detail)}</strong>
              </div>
              <div>
                <span>Rendimento</span>
                <strong>{yieldLabel(detail)}</strong>
              </div>
              <div>
                <span>Preparo</span>
                <strong>{detail.minutes} min</strong>
              </div>
            </div>
            {detail.yield_kg === null && (
              <p className="form-message">
                Informe o rendimento final em kg ao editar esta receita para
                calcular o custo por kg. O custo total dos ingredientes
                permanece disponível.
              </p>
            )}
            <h3>Ingredientes</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ingrediente</th>
                    <th>Quantidade</th>
                    <th>Preço / kg</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.ingredients.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>
                        {i.quantity} {i.unit}
                      </td>
                      <td>{money(i.price)}</td>
                      <td>{money(itemCost(i))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Custo total do prato</td>
                    <td>{money(totalCost(detail))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <h3>Modo de preparo</h3>
            {detail.steps.map((s, i) => (
              <div className="detail-step" key={s.id}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p>{s.text}</p>
                  {photo(s.photo) && (
                    <img src={photo(s.photo)} alt={`Etapa ${i + 1}`} />
                  )}
                </div>
              </div>
            ))}
            {detail.notes && (
              <div className="notes">
                <h4>Notas da cozinha</h4>
                <p>{detail.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {auth && (
        <Auth
          onClose={() => {
            setAuth(false);
            setRecovery(false);
          }}
          session={session}
          recovery={recovery}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Auth({
  onClose,
  session,
  recovery,
  notify,
}: {
  onClose: () => void;
  session: Session | null;
  recovery: boolean;
  notify: (s: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "recovery">(
      recovery ? "recovery" : "login",
    ),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email")),
      password = String(data.get("password"));
    try {
      if (mode === "recovery") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        notify("Senha atualizada. Bem-vindo de volta.");
        onClose();
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
        if (error) throw error;
        setMessage("Enviamos as instruções de recuperação para seu e-mail.");
      } else {
        const result =
          mode === "signup"
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (result.data.session) {
          notify("Bem-vindo à sua cozinha.");
          onClose();
        } else
          setMessage(
            "Confira seu e-mail para confirmar o cadastro e depois entre na sua conta.",
          );
      }
    } catch (err) {
      setMessage(
        err instanceof Error && /invalid login/i.test(err.message)
          ? "E-mail ou senha incorretos."
          : err instanceof Error
            ? err.message
            : "Não foi possível conectar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <div className="auth-content">
        <div className="brand">
          Le Chef<span>✳</span>
        </div>
        <div className="eyebrow">SUA COZINHA, SEMPRE COM VOCÊ</div>
        <h2>
          {mode === "recovery"
            ? "Uma nova senha."
            : session
              ? "Tudo no seu lugar."
              : mode === "signup"
                ? "Um novo capítulo."
                : mode === "reset"
                  ? "Vamos recomeçar."
                  : "Entre na sua cozinha."}
        </h2>
        <p>
          {session
            ? session.user.email
            : "Suas receitas, fotos e custos guardados com cuidado, em qualquer dispositivo."}
        </p>
        {session && mode !== "recovery" ? (
          <button
            className="primary"
            onClick={async () => {
              await supabase.auth.signOut();
              onClose();
            }}
          >
            Sair da conta
          </button>
        ) : (
          <form onSubmit={submit}>
            {mode !== "recovery" && (
              <label>
                E-mail
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="voce@restaurante.com.br"
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  minLength={8}
                  required
                  placeholder="Pelo menos 8 caracteres"
                  autoComplete={
                    mode === "signup" || mode === "recovery"
                      ? "new-password"
                      : "current-password"
                  }
                />
              </label>
            )}
            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {mode === "recovery"
                ? "Salvar nova senha"
                : mode === "signup"
                  ? "Criar minha conta"
                  : mode === "reset"
                    ? "Enviar instruções"
                    : "Entrar"}
              <ArrowRight size={17} />
            </button>
            {mode !== "recovery" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode(mode === "signup" ? "login" : "signup");
                  setMessage("");
                }}
              >
                {mode === "signup"
                  ? "Já tenho uma conta"
                  : "Primeira vez por aqui? Criar conta"}
              </button>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-button"
                onClick={() => setMode("reset")}
              >
                Esqueci minha senha
              </button>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}
function Editor({
  initial,
  books,
  onClose,
  onSave,
  saving,
  session,
  photo,
  notify,
}: {
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
          .from("receita-fotos")
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
                s.id === stepId ? { ...s, photo: path } : s,
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
                    value={r.book_id || ""}
                    onChange={(e) =>
                      update({ book_id: e.target.value || null })
                    }
                  >
                    <option value="">Sem livro</option>
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
