import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoaderCircle, Package, RefreshCw } from "lucide-react";
import { request } from "./everest-api";
import "./stock.css";
import { StockControl } from "./StockControl";
import type { StockCatalog } from "../shared/stock-ledger.mjs";

type Invoice = {
  id: number;
  unitId: number;
  unitName: string;
  number: string;
  series: string;
  supplier: string;
  issuedAt: string;
  total: number | null;
  status: number | null;
};
type Item = {
  id: number;
  invoiceId: number;
  itemId: number | null;
  code: string;
  name: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
};
type CatalogItem = StockCatalog;
type Entry = Item & { invoice: Invoice; category: string };
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
const currency = (value: number | null) =>
  value === null
    ? "Não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sum = (values: (number | null)[]) =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((total, v) => total + (v ?? 0), 0);
export function Stock({
  session,
  onLogin,
}: {
  session: Session | null;
  onLogin: () => void;
}) {
  const [start, setStart] = useState("2026-10-20"),
    [end, setEnd] = useState(today);
  const [period, setPeriod] = useState({
    start: "2026-10-20",
    end: today(),
    revision: 0,
  });
  const [data, setData] = useState<{
    invoices: Invoice[];
    entries: Entry[];
    catalog: CatalogItem[];
    fetchedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [category, setCategory] = useState(""),
    [unit, setUnit] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setCategory("");
    setUnit("");
    async function pages<T extends { id: number }>(
      kind: string,
      label: string,
      unitId?: number,
    ): Promise<T[]> {
      const result = new Map<number, T>();
      let totalPages = 1;
      for (let page = 1; page <= totalPages; page++) {
        setProgress(`${label} · página ${page} de ${totalPages}`);
        const params = new URLSearchParams({
          kind,
          start: period.start,
          end: period.end,
          page: String(page),
        });
        if (unitId) params.set("unit", String(unitId));
        const response = await request<{ records: T[]; totalPages: number }>(
          params,
          controller.signal,
          undefined,
          "/api/everest-stock",
        );
        if (
          !Number.isSafeInteger(response.totalPages) ||
          response.totalPages < 1 ||
          response.totalPages > 10000 ||
          (page > 1 && response.totalPages !== totalPages)
        )
          throw Error(
            "Os dados mudaram durante a consulta. Atualize para consultar novamente.",
          );
        totalPages = response.totalPages;
        response.records.forEach((record) => result.set(record.id, record));
      }
      return [...result.values()];
    }
    async function load() {
      try {
        const invoices = await pages<Invoice>(
          "invoices",
          "Buscando notas de entrada",
        );
        const items: Item[] = [];
        for (const id of new Set(invoices.map((invoice) => invoice.unitId)))
          items.push(
            ...(await pages<Item>(
              "items",
              `Buscando mercadorias da unidade ${id}`,
              id,
            )),
          );
        const catalog = items.length
          ? await pages<CatalogItem>("catalog", "Buscando categorias")
          : [];
        const categories = new Map(
          catalog.map((item) => [item.id, item.category]),
        );
        const invoiceMap = new Map(
          invoices.map((invoice) => [invoice.id, invoice]),
        );
        const entries = [
          ...new Map(items.map((item) => [item.id, item])).values(),
        ].map((item) => {
          const invoice = invoiceMap.get(item.invoiceId);
          if (!invoice)
            throw Error(
              "As notas e os itens retornados não conferem. Atualize a consulta.",
            );
          return {
            ...item,
            invoice,
            category: categories.get(item.itemId ?? 0) || "Sem categoria",
          };
        });
        if (!controller.signal.aborted)
          setData({
            invoices,
            entries,
            catalog,
            fetchedAt: new Date().toLocaleString("pt-BR"),
          });
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Falha ao consultar estoque.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [session?.user.id, period]);
  const categories = [
    ...new Set(data?.entries.map((entry) => entry.category) || []),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const units = [
    ...new Map(
      data?.invoices.map((invoice) => [
        invoice.unitId,
        invoice.unitName || `Unidade ${invoice.unitId}`,
      ]) || [],
    ).entries(),
  ];
  const entries = useMemo(
    () =>
      (data?.entries || []).filter(
        (entry) =>
          (!category || entry.category === category) &&
          (!unit || entry.invoice.unitId === Number(unit)) &&
          `${entry.name} ${entry.code} ${entry.invoice.number} ${entry.invoice.supplier}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")),
      ),
    [data, category, unit, search],
  );
  const groups = [...new Set(entries.map((entry) => entry.category))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const missingItems =
    data?.invoices.filter(
      (invoice) =>
        !data.entries.some((entry) => entry.invoiceId === invoice.id),
    ) || [];
  return (
    <section className="stock-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> EVEREST · ENTRADA DE MERCADORIAS
          </div>
          <h1>Estoque</h1>
          <p>Entradas, consumo e disponibilidade dos pratos por restaurante.</p>
        </div>
        <Package size={36} />
      </div>
      {!session ? (
        <div className="empty">
          <Package size={36} />
          <h2>Consulte suas entradas do Everest</h2>
          <p>Entre na sua conta para carregar as notas fiscais.</p>
          <button className="primary" onClick={onLogin}>
            Entrar na conta
          </button>
        </div>
      ) : (
        <>
          <form
            className="stock-filters"
            onSubmit={(event) => {
              event.preventDefault();
              setPeriod({ start, end, revision: period.revision + 1 });
            }}
          >
            <label>
              Entrada a partir de
              <input
                required
                type="date"
                value={start}
                max={end}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              Até
              <input
                required
                type="date"
                value={end}
                min={start}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <button className="primary" disabled={loading}>
              <RefreshCw size={16} /> Consultar entradas
            </button>
          </form>
          <p className="stock-note">
            Período pela data de lançamento no Everest, incluindo o primeiro e o
            último dia. O controle abaixo estima o saldo com as vendas
            importadas do Lorean.
          </p>
          {loading && (
            <div className="empty" role="status">
              <LoaderCircle className="spin" />
              <p>{progress}</p>
              <small>Aguarde a conclusão de todas as páginas.</small>
            </div>
          )}
          {error && (
            <div className="stock-error" role="alert">
              <p>{error}</p>
              <button
                onClick={() =>
                  setPeriod({ ...period, revision: period.revision + 1 })
                }
              >
                Tentar novamente
              </button>
            </div>
          )}
          {data && (
            <>
              <StockControl
                entries={data.entries}
                catalog={data.catalog}
                start={period.start}
                end={period.end}
                missingInvoices={missingItems}
              />
              <p className="stock-note">
                Consulta de {period.start.split("-").reverse().join("/")} a{" "}
                {period.end.split("-").reverse().join("/")} · Atualizada em{" "}
                {data.fetchedAt}
              </p>
              <div className="stock-summary">
                <div>
                  <small>Notas recebidas no período</small>
                  <strong>{data.invoices.length}</strong>
                </div>
                <div>
                  <small>Categorias</small>
                  <strong>{categories.length}</strong>
                </div>
                <div>
                  <small>Valor dos itens exibidos</small>
                  <strong>
                    {currency(sum(entries.map((entry) => entry.total)))}
                  </strong>
                </div>
              </div>
              <div className="stock-filters">
                <label>
                  Categoria
                  <select
                    aria-label="Categoria"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade
                  <select
                    aria-label="Unidade"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                  >
                    <option value="">Todas as unidades</option>
                    {units.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="stock-search">
                  Buscar
                  <input
                    type="search"
                    placeholder="Mercadoria, fornecedor ou NF"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {missingItems.length > 0 && (
                <div className="stock-error">
                  <strong>
                    {missingItems.length} nota(s) sem itens retornados pelo
                    Everest
                  </strong>
                  <p>
                    Não incluídas nos totais por categoria:{" "}
                    {missingItems
                      .map(
                        (invoice) =>
                          `NF ${invoice.number} (${invoice.supplier})`,
                      )
                      .join("; ")}
                    .
                  </p>
                </div>
              )}
              {groups.map((name) => {
                const rows = entries.filter((entry) => entry.category === name);
                return (
                  <section className="stock-group" key={name}>
                    <header>
                      <div>
                        <h2>{name}</h2>
                        <small>
                          {rows.length} itens ·{" "}
                          {new Set(rows.map((row) => row.invoiceId)).size} notas
                        </small>
                      </div>
                      <strong>
                        {currency(sum(rows.map((row) => row.total)))}
                      </strong>
                    </header>
                    <div className="stock-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Mercadoria</th>
                            <th>NF / Série</th>
                            <th>Fornecedor / Unidade</th>
                            <th>Emissão</th>
                            <th>Quantidade</th>
                            <th>Valor unitário</th>
                            <th>Total do item</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <strong>
                                  {row.name || "Item sem descrição"}
                                </strong>
                                <small>{row.code}</small>
                              </td>
                              <td>
                                {row.invoice.number} /{" "}
                                {row.invoice.series || "—"}
                                <small>
                                  Situação Everest:{" "}
                                  {row.invoice.status ?? "Não informada"}
                                </small>
                              </td>
                              <td>
                                {row.invoice.supplier || "Não informado"}
                                <small>
                                  {row.invoice.unitName ||
                                    `Unidade ${row.invoice.unitId}`}
                                </small>
                              </td>
                              <td>
                                {row.invoice.issuedAt
                                  .slice(0, 10)
                                  .split("-")
                                  .reverse()
                                  .join("/") || "—"}
                              </td>
                              <td>
                                {row.quantity?.toLocaleString("pt-BR", {
                                  maximumFractionDigits: 4,
                                }) ?? "—"}{" "}
                                {row.unit}
                              </td>
                              <td>{currency(row.unitPrice)}</td>
                              <td>{currency(row.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
              {!entries.length && (
                <div className="empty">
                  <Package size={32} />
                  <h2>
                    {data.invoices.length
                      ? "Nenhum item para os filtros selecionados"
                      : "Nenhuma nota de entrada no período"}
                  </h2>
                  <p>
                    Altere o período ou os filtros para consultar outras
                    entradas.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
