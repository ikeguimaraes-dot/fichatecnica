import { useState } from "react";
import type { StockContext, Ledger } from "../shared/stock-ledger.mjs";
import {
  rankSales,
  TOP_CATEGORIES,
  topCategory,
} from "../shared/stock-menu.mjs";
const quantity = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const money = (n: number | null | undefined) =>
  n == null
    ? "Não informado"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string) => s.split("-").reverse().join("/");
function PrincipalStock({ name, ledger }: { name: string; ledger: Ledger }) {
  const dish = ledger.dishes.find((d) => d.name === name);
  const principal = dish?.principal;
  if (!principal)
    return <span>Principal a conferir · ficha ou custos incompletos</span>;
  const row = ledger.rows.find(
    (r) => r.itemId === principal.itemId && r.unit === principal.unit,
  );
  const incompatible = ledger.rows.some(
    (r) => r.itemId === principal.itemId && r.unit !== principal.unit,
  );
  const valid =
    !dish.reason &&
    !principal.preparation &&
    !incompatible &&
    dish.requirements.some(
      (r) => r.itemId === principal.itemId && r.unit === principal.unit,
    );
  return (
    <>
      <strong>{principal.name}</strong>
      <br />
      <span>
        {valid
          ? `${quantity(row?.balance ?? 0)} ${principal.unit}${ledger.complete ? "" : " (estimado)"}`
          : principal.preparation
            ? "Preparo interno · saldo a conferir"
            : "Saldo a conferir"}
      </span>
      <small className="stock-principal-cost">
        Custo na ficha: {money(principal.appliedCost)}
      </small>
    </>
  );
}
export function StockTopProducts({
  context,
  ledger,
}: {
  context: StockContext;
  ledger: Ledger;
}) {
  const [selected, setSelected] = useState<string[]>(TOP_CATEGORIES);
  const sales = context.sales.filter((s) => selected.includes(topCategory(s)));
  const byQuantity = rankSales(sales, "quantity"),
    byValue = rankSales(sales, "value");
  const incomplete = sales.filter(
    (s) => s.suspect || s.quantityValid === false || s.netValue == null,
  ).length;
  return (
    <section className="stock-top-products">
      <h3>Top 20 produtos · {context.unit.name}</h3>
      <p className="stock-note">
        De {date(context.start)} a {date(context.end)} · Vendas importadas até{" "}
        {context.lastDate ? date(context.lastDate) : "nenhuma data"}. Prioridade
        1 corresponde ao maior resultado em cada ranking.
      </p>
      <p className="stock-note">
        Valor vendido = venda bruta menos descontos, sem gorjeta. Produtos são
        somados no período, mesmo sem ficha vinculada. Empates são ordenados
        pelo nome.
      </p>
      <fieldset className="stock-top-filters">
        <legend>Categorias do Top 20</legend>
        {TOP_CATEGORIES.map((category) => (
          <label key={category}>
            <input
              type="checkbox"
              checked={selected.includes(category)}
              onChange={(e) =>
                setSelected((current) =>
                  e.target.checked
                    ? [...current, category]
                    : current.filter((c) => c !== category),
                )
              }
            />
            {category}
          </label>
        ))}
        <button type="button" onClick={() => setSelected([...TOP_CATEGORIES])}>
          Selecionar todas
        </button>
        <button type="button" onClick={() => setSelected([])}>
          Limpar seleção
        </button>
      </fieldset>
      <p className="stock-note">
        Os rankings consideram as categorias marcadas. Outros reúne itens sem
        classificação nessas categorias. Produto principal = item de maior custo
        aplicado na ficha; estoque em KG, L ou UN, após as vendas importadas.
        Custos incompletos ficam a conferir.
      </p>
      {incomplete > 0 && (
        <p className="stock-error">
          {incomplete} produto(s) com dados ausentes, inválidos ou suspeitos.
          Valores desconhecidos não entram no ranking por valor; quantidades
          inválidas não entram no ranking por quantidade. Produtos suspeitos
          ficam fora dos dois rankings.
        </p>
      )}
      <div className="stock-ranking-grid">
        {(
          [
            {
              title: "Ranking por quantidade",
              rows: byQuantity,
              metric: "quantity",
            },
            { title: "Ranking por valor", rows: byValue, metric: "value" },
          ] as const
        ).map(({ title, rows, metric }) => (
          <section key={metric} aria-label={title}>
            <h4>{title}</h4>
            <p className="stock-note">
              Do maior para o menor · {rows.length} produtos
            </p>
            {rows.length ? (
              <div className="stock-table-wrap">
                <table className="stock-ledger-table">
                  <thead>
                    <tr>
                      <th>Prioridade</th>
                      <th>Produto</th>
                      <th>Produto principal · estoque</th>
                      <th>
                        {metric === "quantity"
                          ? "Qtd. vendida"
                          : "Valor vendido"}
                      </th>
                      <th>
                        {metric === "quantity"
                          ? "Valor vendido"
                          : "Qtd. vendida"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.name}>
                        <td>
                          <span className="stock-rank-number">{s.rank}</span>
                        </td>
                        <td>
                          {s.name}
                          <small className="stock-principal-cost">
                            {topCategory(s)}
                          </small>
                        </td>
                        <td>
                          <PrincipalStock name={s.name} ledger={ledger} />
                        </td>
                        <td>
                          <strong>
                            {metric === "quantity"
                              ? quantity(s.quantity)
                              : money(s.netValue)}
                          </strong>
                        </td>
                        <td>
                          {metric === "quantity"
                            ? money(s.netValue)
                            : s.quantityValid === false
                              ? "A conferir"
                              : quantity(s.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                Sem vendas válidas para este ranking no período.
              </p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
