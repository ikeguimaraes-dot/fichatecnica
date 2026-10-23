import type { StockContext } from "../shared/stock-ledger.mjs";
import { rankSales } from "../shared/stock-menu.mjs";
const quantity = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const money = (n: number | null | undefined) =>
  n == null
    ? "Não informado"
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string) => s.split("-").reverse().join("/");
export function StockTopProducts({ context }: { context: StockContext }) {
  const byQuantity = rankSales(context.sales, "quantity"),
    byValue = rankSales(context.sales, "value");
  const incomplete = context.sales.filter(
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
                        <td>{s.name}</td>
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
