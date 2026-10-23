import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { request } from "./everest-api";
import { supabase } from "./supabase";
import { StockMenu } from "./StockMenu";
import {
  computeLedger,
  STOCK_START,
  type StockCatalog,
  type StockEntry,
  type StockContext,
} from "../shared/stock-ledger.mjs";
const format = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const day = (s: string | null) =>
  s ? s.split("-").reverse().join("/") : "Nenhum dia importado";
const restaurants = [
  { id: 1, name: "Meet & Eat" },
  { id: 3, name: "Madonna Cucina" },
  { id: 5, name: "Match Point" },
  { id: 10, name: "Freneze" },
];
export function StockControl({
  entries,
  catalog,
  end,
  start,
  missingInvoices,
}: {
  entries: StockEntry[];
  catalog: StockCatalog[];
  end: string;
  start: string;
  missingInvoices: { unitId: number }[];
}) {
  const [unit, setUnit] = useState(1),
    [revision, setRevision] = useState(0),
    [context, setContext] = useState<StockContext | null>(null),
    [error, setError] = useState("");
  const [tab, setTab] = useState("dishes"),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [onlyMissing, setOnlyMissing] = useState(false);
  const [edit, setEdit] = useState<string | null>(null),
    [recipe, setRecipe] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setContext(null);
    setError("");
    setEdit(null);
    setCategory("");
    request<StockContext>(
      new URLSearchParams({ unit: String(unit), end }),
      controller.signal,
      undefined,
      "/api/stock-context",
    )
      .then((value) => {
        if (!controller.signal.aborted) setContext(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [unit, end, revision]);
  const ledger = useMemo(
    () =>
      context &&
      computeLedger({
        entries,
        catalog,
        context,
        missingInvoices: missingInvoices.filter((n) => n.unitId === unit)
          .length,
      }),
    [entries, catalog, context, missingInvoices, unit],
  );
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error("Entre novamente na sua conta.");
      const response = await fetch("/api/stock-context", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unitId: unit,
          saleName: edit,
          recipeId: Number(recipe),
          outputPerSale: Number(quantity),
        }),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Falha ao salvar vínculo");
      setEdit(null);
      setRevision((n) => n + 1);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Falha ao salvar vínculo",
      );
    } finally {
      setSaving(false);
    }
  }
  const selected = context?.options.find(
    (option) => option.id === Number(recipe),
  );
  return (
    <section className="stock-control">
      <header>
        <h2>Controle de estoque</h2>
        <p>
          Estoque inicial zero em 20/10/2026. Entradas menos consumo das vendas
          por restaurante.
        </p>
      </header>
      {start !== STOCK_START ? (
        <div className="stock-error">
          Para calcular o saldo, consulte as entradas desde 20/10/2026.
        </div>
      ) : (
        <>
          <div className="stock-filters">
            <label>
              Restaurante
              <select
                aria-label="Restaurante do estoque"
                value={unit}
                onChange={(e) => setUnit(Number(e.target.value))}
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setRevision((n) => n + 1)}>
              Atualizar vendas do banco
            </button>
          </div>
          {error && (
            <div className="stock-error" role="alert">
              {error}
            </div>
          )}
          {!context && !error && (
            <p role="status">
              <LoaderCircle className="spin" size={18} /> Consultando vendas
              desde o dia 20 e fichas técnicas…
            </p>
          )}
          {context && ledger && (
            <>
              <p className="stock-note">
                Vendas importadas até {day(context.lastDate)} · Fichas
                sincronizadas em{" "}
                {context.syncedAt
                  ? new Date(context.syncedAt).toLocaleString("pt-BR")
                  : "data não informada"}
                . Novas vendas entram no cálculo ao atualizar. Vínculos e fichas
                atuais são aplicados a todo o período.
              </p>
              <div className="stock-summary">
                <div>
                  <small>Pratos sem saldo para uma porção</small>
                  <strong>
                    {ledger.dishes.filter((d) => d.portions === 0).length}
                  </strong>
                </div>
                <div>
                  <small>Insumos com saldo negativo</small>
                  <strong>
                    {ledger.rows.filter((r) => r.balance < 0).length}
                  </strong>
                </div>
                <div>
                  <small>Produtos vendidos com pendências</small>
                  <strong>{context.pending.length}</strong>
                </div>
              </div>
              {!ledger.complete && (
                <div className="stock-error">
                  <strong>Cálculo parcial — disponibilidade estimada</strong>
                  <p>
                    Há vendas, conversões ou dias pendentes. Os saldos ainda não
                    incluem todo o consumo e não confirmam disponibilidade para
                    venda.
                  </p>
                  <details>
                    <summary>
                      Ver {ledger.issues.length} avisos e cobertura diária
                    </summary>
                    <ul>
                      {ledger.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
              <div
                className="stock-tabs"
                role="tablist"
                aria-label="Controle de estoque"
              >
                {[
                  ["menu", "Cardápio por restaurante"],
                  ["dishes", "Disponibilidade dos pratos"],
                  ["ingredients", "Saldo por categoria"],
                  ["sales", "Vendas e vínculos"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="stock-filters">
                <label className="stock-search">
                  Buscar no controle
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Prato, insumo ou produto vendido"
                  />
                </label>
                {tab === "ingredients" && (
                  <label>
                    Categoria do saldo
                    <select
                      aria-label="Categoria do saldo"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">Todas</option>
                      {[...new Set(ledger.rows.map((r) => r.category))]
                        .sort()
                        .map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                    </select>
                  </label>
                )}
                {tab === "dishes" && (
                  <label>
                    <span>Somente sem saldo</span>
                    <input
                      type="checkbox"
                      checked={onlyMissing}
                      onChange={(e) => setOnlyMissing(e.target.checked)}
                    />
                  </label>
                )}
              </div>
              {tab === "menu" && (
                <StockMenu
                  key={`${context.unit.id}:${context.syncedAt}`}
                  context={context}
                  ledger={ledger}
                  search={search}
                />
              )}
              {tab === "dishes" && (
                <>
                  <p className="stock-note">
                    Porções calculadas para cada prato individualmente. Pratos
                    compartilham ingredientes: as disponibilidades não devem ser
                    somadas. Perdas e transferências não registradas nas
                    entradas não entram neste saldo teórico.
                  </p>
                  <div className="stock-table-wrap">
                    <table className="stock-ledger-table">
                      <thead>
                        <tr>
                          <th>Prato</th>
                          <th>Vendido desde dia 20</th>
                          <th>Porções possíveis</th>
                          <th>Ingrediente limitante / pendência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.dishes
                          .filter(
                            (d) =>
                              d.name
                                .toLowerCase()
                                .includes(search.toLowerCase()) &&
                              (!onlyMissing || d.portions === 0),
                          )
                          .sort(
                            (a, b) =>
                              (a.portions ?? Infinity) -
                              (b.portions ?? Infinity),
                          )
                          .map((d) => (
                            <tr key={d.id}>
                              <td>
                                <strong>{d.name}</strong>
                              </td>
                              <td>{format(d.sold)}</td>
                              <td>
                                <span
                                  className={
                                    d.portions === 0 ? "stock-negative" : ""
                                  }
                                >
                                  {d.portions === null
                                    ? "A conferir"
                                    : d.portions === 0
                                      ? "Sem saldo"
                                      : `${format(d.portions)}${!ledger.complete ? " (estimadas)" : ""}`}
                                </span>
                              </td>
                              <td>
                                {d.reason ||
                                  d.limiting
                                    .map(
                                      (i) =>
                                        `${i.name}: ${format(i.balance)} ${i.unit} disponíveis; ${format(i.quantity)} por porção`,
                                    )
                                    .join("; ") ||
                                  "Conversão de unidades pendente"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === "ingredients" && (
                <div className="stock-table-wrap">
                  <table className="stock-ledger-table">
                    <thead>
                      <tr>
                        <th>Categoria / Insumo</th>
                        <th>Entradas</th>
                        <th>Consumo calculado</th>
                        <th>Saldo teórico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.rows
                        .filter(
                          (r) =>
                            (!category || r.category === category) &&
                            r.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .sort((a, b) =>
                          a.category.localeCompare(b.category, "pt-BR"),
                        )
                        .map((r) => (
                          <tr key={`${r.itemId}:${r.unit}`}>
                            <td>
                              <small>{r.category}</small>
                              <strong>{r.name}</strong>
                            </td>
                            <td>
                              {format(r.received)} {r.unit}
                            </td>
                            <td>
                              {format(r.consumed)} {r.unit}
                            </td>
                            <td
                              className={r.balance < 0 ? "stock-negative" : ""}
                            >
                              {format(r.balance)} {r.unit}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {tab === "sales" && (
                <>
                  <div className="stock-daily">
                    {context.daily.map((d) => (
                      <div key={d.date}>
                        <strong>{day(d.date)}</strong>
                        <span>
                          {d.products
                            ? `${d.products} registros · ${format(d.quantity)} vendidos`
                            : "Sem produtos importados"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="stock-note">
                    Um vínculo confirmado informa qual ficha consumir e quanto
                    do rendimento corresponde a cada produto vendido. Ele será
                    aplicado desde o dia 20.
                  </p>
                  <div className="stock-table-wrap">
                    <table className="stock-ledger-table">
                      <thead>
                        <tr>
                          <th>Produto Lorean</th>
                          <th>Quantidade</th>
                          <th>Conferência</th>
                          <th>Vínculo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {context.sales
                          .filter((s) =>
                            s.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((s) => {
                            const pending = context.pending.find(
                                (p) => p.name === s.name,
                              ),
                              dish = context.dishes.find(
                                (d) => d.name === s.name,
                              );
                            return (
                              <tr key={s.name}>
                                <td>{s.name}</td>
                                <td>{format(s.quantity)}</td>
                                <td>
                                  {pending?.reason ||
                                    `${dish?.recipeName} · ${dish?.outputPerSale} ${dish?.outputUnit} por venda`}
                                </td>
                                <td>
                                  {context.canEdit ? (
                                    <button
                                      onClick={() => {
                                        setEdit(s.name);
                                        setRecipe(
                                          String(
                                            pending?.recipeId ||
                                              dish?.recipeId ||
                                              "",
                                          ),
                                        );
                                        setQuantity(
                                          String(
                                            pending?.outputPerSale ||
                                              dish?.outputPerSale ||
                                              1,
                                          ),
                                        );
                                        setSaveError("");
                                      }}
                                    >
                                      Conferir vínculo
                                    </button>
                                  ) : (
                                    "Somente consulta"
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {edit && (
                <form className="stock-link-form" onSubmit={save}>
                  <h3>Vincular: {edit}</h3>
                  <label>
                    Ficha técnica
                    <select
                      aria-label="Ficha para consumo"
                      required
                      value={recipe}
                      onChange={(e) => setRecipe(e.target.value)}
                    >
                      <option value="">Selecione a ficha</option>
                      {context.options.map((o) => (
                        <option value={o.id} key={o.id}>
                          {o.name} — rendimento {o.yield} {o.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantidade de {selected?.unit || "saída da ficha"} por
                    produto vendido
                    <input
                      aria-label="Quantidade por venda"
                      required
                      type="number"
                      min="0.000001"
                      max="999999"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </label>
                  <p>
                    Exemplo: uma ficha em KG e uma porção de 200 g corresponde a
                    0,2 KG por venda. Uma ficha em UNID vendida por unidade
                    corresponde a 1.
                  </p>
                  {saveError && <p role="alert">{saveError}</p>}
                  <button className="primary" disabled={saving}>
                    Confirmar vínculo e recalcular
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setEdit(null)}
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
