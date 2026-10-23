import { useEffect, useId, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { request } from "./everest-api";
import type { EverestDetail } from "./everest-types";
import type { Ledger, StockContext } from "../shared/stock-ledger.mjs";
const quantity = (value: number | null) =>
  value === null
    ? "Não informado"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
type MenuDish = Ledger["dishes"][number];

function MenuRecipe({
  dish,
  context,
  ledger,
}: {
  dish: MenuDish;
  context: StockContext;
  ledger: Ledger;
}) {
  const [detail, setDetail] = useState<EverestDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError("");
    const params = new URLSearchParams({
      kind: "detail",
      unit: String(context.unit.id),
      id: String(dish.recipeId),
    });
    if (context.snapshotId) params.set("snapshot", context.snapshotId);
    request<{ record: EverestDetail }>(params, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result.record);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [context.unit.id, context.snapshotId, dish.recipeId, retry]);
  return (
    <div className="stock-menu-detail">
      <section className="stock-menu-recipe">
        <h4>Ficha técnica</h4>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry((n) => n + 1)}>
              Tentar abrir ficha novamente
            </button>
          </div>
        ) : !detail ? (
          <p role="status">
            <LoaderCircle size={16} className="spin" /> Carregando ficha
            técnica…
          </p>
        ) : (
          <>
            <p>
              <strong>{detail.name}</strong>
            </p>
            <p className="stock-note">
              Rendimento da ficha: {quantity(detail.quantity)} {detail.unit} ·
              Versão {detail.version ?? "não informada"}
            </p>
            <p className="stock-note">
              Por venda:{" "}
              {dish.outputPerSale === null
                ? "porção pendente de conferência"
                : `${quantity(dish.outputPerSale)} ${dish.outputUnit}`}
              .
            </p>
            <div className="stock-table-wrap">
              <table className="stock-ledger-table">
                <caption>Ingredientes para o rendimento total da ficha</caption>
                <thead>
                  <tr>
                    <th>Ingrediente / preparo</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.components.map((component, index) => (
                    <tr key={`${component.itemId}:${index}`}>
                      <td>{component.name}</td>
                      <td>
                        {quantity(component.quantity)} {component.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!detail.components.length && (
              <p>Nenhum ingrediente informado nesta ficha.</p>
            )}
            {detail.instructions && (
              <div className="stock-menu-instructions">
                <h5>Modo de preparo cadastrado</h5>
                <p>{detail.instructions}</p>
              </div>
            )}
            {detail.notes && (
              <div className="stock-menu-instructions">
                <h5>Observações</h5>
                <p>{detail.notes}</p>
              </div>
            )}
          </>
        )}
      </section>
      <section className="stock-menu-balance">
        <h4>Estoque de {context.unit.name}</h4>
        <p className="stock-note">
          Saldo teórico após as vendas importadas. Preparos internos estão
          desdobrados nos ingredientes abaixo.
        </p>
        {dish.reason && <p className="stock-error">{dish.reason}</p>}
        {dish.requirements.length > 0 ? (
          <div className="stock-table-wrap">
            <table className="stock-ledger-table">
              <caption>Consumo por porção e saldo dos ingredientes</caption>
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>Por porção</th>
                  <th>Em estoque</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {dish.requirements.map((ingredient) => {
                  const stock = ledger.rows.find(
                    (row) =>
                      row.itemId === ingredient.itemId &&
                      row.unit === ingredient.unit,
                  );
                  const incompatible = ledger.rows.some(
                    (row) =>
                      row.itemId === ingredient.itemId &&
                      row.unit !== ingredient.unit,
                  );
                  const balance = stock?.balance ?? 0;
                  const missing = Math.max(0, ingredient.quantity - balance);
                  return (
                    <tr key={`${ingredient.itemId}:${ingredient.unit}`}>
                      <td>{ingredient.name}</td>
                      <td>
                        {quantity(ingredient.quantity)} {ingredient.unit}
                      </td>
                      <td className={balance < 0 ? "stock-negative" : ""}>
                        {quantity(balance)} {ingredient.unit}
                      </td>
                      <td
                        className={
                          !incompatible && missing > 0 ? "stock-negative" : ""
                        }
                      >
                        {incompatible
                          ? "Conversão pendente"
                          : missing > 0
                            ? `Faltam ${quantity(missing)} ${ingredient.unit} para uma porção`
                            : ledger.complete
                              ? "Saldo suficiente"
                              : "Saldo estimado suficiente"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            O estoque por ingrediente ficará disponível após conferir a
            composição e a porção deste prato.
          </p>
        )}
        {!ledger.complete && (
          <p className="stock-note">
            Há pendências na apuração. Os saldos e as porções são estimados.
          </p>
        )}
      </section>
    </div>
  );
}
export function StockMenu({
  context,
  ledger,
  search,
}: {
  context: StockContext;
  ledger: Ledger;
  search: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const prefix = useId();
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const dishes = ledger.dishes
    .filter((dish) =>
      `${dish.name} ${dish.recipeName}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const pending = context.pending.filter(
    (item) =>
      !ledger.dishes.some((dish) => dish.name === item.name) &&
      item.name.toLocaleLowerCase("pt-BR").includes(query),
  );
  return (
    <section
      className="stock-menu"
      aria-label={`Cardápio de ${context.unit.name}`}
    >
      <h3>Cardápio · {context.unit.name}</h3>
      <p className="stock-note">
        Pratos das fichas da unidade e produtos vendidos no Lorean. Abra a seta
        para comparar a ficha técnica com os ingredientes em estoque.
      </p>
      {!dishes.length && !pending.length && (
        <p className="empty">
          Nenhum item encontrado para esta unidade ou busca.
        </p>
      )}
      {dishes.map((dish, index) => {
        const open = expanded === dish.id,
          id = `${prefix}-${index}`;
        return (
          <article className="stock-menu-item" key={dish.id}>
            <button
              type="button"
              id={`${id}-button`}
              className="stock-menu-toggle"
              aria-expanded={open}
              aria-controls={id}
              aria-label={`${open ? "Fechar" : "Abrir"} ficha de ${dish.name}`}
              onClick={() => setExpanded(open ? null : dish.id)}
            >
              <ChevronDown
                size={20}
                className={open ? "stock-menu-chevron-open" : ""}
                aria-hidden="true"
              />
              <span className="stock-menu-name">
                <strong>{dish.name}</strong>
                <small>{quantity(dish.sold)} vendidos desde o dia 20</small>
              </span>
              <span
                className={`stock-menu-portions ${dish.portions === 0 ? "stock-negative" : ""}`}
              >
                {dish.portions === null
                  ? "Estoque a conferir"
                  : dish.portions === 0
                    ? "Sem saldo para uma porção"
                    : `${quantity(dish.portions)} porções${ledger.complete ? " disponíveis" : " estimadas"}`}
              </span>
            </button>
            {open && (
              <div id={id} role="region" aria-labelledby={`${id}-button`}>
                <MenuRecipe dish={dish} context={context} ledger={ledger} />
              </div>
            )}
          </article>
        );
      })}
      {pending.map((item) => (
        <details className="stock-menu-item stock-menu-pending" key={item.name}>
          <summary>
            <ChevronDown size={20} aria-hidden="true" />
            <strong>{item.name}</strong>
            <span>Ficha não vinculada</span>
          </summary>
          <div className="stock-menu-pending-body">
            <p>{item.reason}</p>
            <p>
              Confira este produto na aba Vendas e vínculos para abrir a ficha e
              calcular o estoque.
            </p>
          </div>
        </details>
      ))}
    </section>
  );
}
