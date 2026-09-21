import { formatQuantity } from "./model";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Cloud,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Scale,
  Search,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Modal } from "./Modal";
import { SharedBook, SharedBookShelf } from "./SharedBooks";
import { EverestPreparation } from "./EverestPreparation";
import type {
  EverestRecord,
  EverestDetail,
  EverestPage,
  EverestUnit,
  EverestCollection,
  EverestSyncJob,
} from "./everest-types";
const numeric = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(n);
const money = (value: number | null | undefined) =>
  value == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
const date = (s: string) => {
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Não informada";
};
const statusName = (status: number | null) =>
  status === 1 ? "Ativa" : status === 3 ? "Inativa" : "Não informada";
const searchText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
async function request<T>(
  params: URLSearchParams,
  signal: AbortSignal,
  body?: { unitId: number | null },
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre na sua conta para consultar o Everest.");
  const response = await fetch(`/api/everest?${params}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "A consulta não está disponível neste ambiente. Tente novamente no site publicado.",
    );
  }
  if (!response.ok)
    throw new Error(data.error || "Não foi possível consultar as fichas.");
  return data;
}
function SyncNotice({ job }: { job: EverestSyncJob | null }) {
  if (!job || (job.status === "completed" && !job.costWarningCount))
    return null;
  return (
    <div
      className={`everest-sync-notice ${job.status === "failed" ? "failed" : ""}`}
      role="status"
    >
      {job.status !== "failed" && job.status !== "completed" && (
        <LoaderCircle size={18} className="spin" />
      )}
      <div>
        <strong>
          {job.status === "completed"
            ? "Atualização concluída com custos pendentes"
            : job.status === "failed"
              ? "A atualização não foi concluída"
              : "Atualização em segundo plano"}
        </strong>
        <p>
          {job.status === "completed"
            ? `${job.costWarningCount} itens retornaram sem custos no Everest. As fichas estão disponíveis e os custos ausentes estão sinalizados.`
            : job.status === "failed"
              ? job.error
              : job.progress}
        </p>
        <small>
          {job.status === "completed"
            ? "Custos ausentes não foram substituídos por zero. Uma nova atualização consultará esses itens novamente."
            : job.status === "failed"
              ? "A última cópia concluída continua disponível. Use Atualizar para tentar novamente."
              : "Você pode fechar a página. A cópia atual continua disponível até cada livro ficar pronto."}
        </small>
      </div>
    </div>
  );
}
function UnitRecipes({
  session,
  onLogin,
  unit,
  onBack,
  onSync,
  job = null,
  syncing = false,
  syncError = "",
}: {
  session: Session | null;
  onLogin: () => void;
  unit?: EverestUnit;
  onBack?: () => void;
  onSync?: () => void;
  job?: EverestSyncJob | null;
  syncing?: boolean;
  syncError?: string;
}) {
  const [records, setRecords] = useState<EverestRecord[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState(""),
    [environment, setEnvironment] = useState("production");
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<EverestRecord | null>(null),
    [detail, setDetail] = useState<EverestDetail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState("");
  const listController = useRef<AbortController | null>(null),
    detailController = useRef<AbortController | null>(null);
  async function load() {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true);
    setError("");
    setRecords([]);
    setUpdated("");
    setPage(1);
    try {
      if (!unit) return;
      const data = await request<EverestPage>(
        new URLSearchParams({ kind: "book", unit: String(unit.id) }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRecords(data.records);
      setSnapshotId(data.snapshotId || null);
      setUpdated(data.fetchedAt);
      setEnvironment(data.environment);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Falha ao consultar as fichas.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function open(record: EverestRecord) {
    if (
      preparationDirty.current &&
      !window.confirm("Reabrir a ficha e descartar o preparo ainda não salvo?")
    )
      return;
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelected(record);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await request<{ record: EverestDetail }>(
        new URLSearchParams({
          id: String(record.id),
          ...(unit ? { unit: String(unit.id) } : {}),
          ...(snapshotId ? { snapshot: snapshotId } : {}),
        }),
        controller.signal,
      );
      if (!controller.signal.aborted) setDetail(result.record);
    } catch (e) {
      if (!controller.signal.aborted)
        setDetailError(
          e instanceof Error ? e.message : "Falha ao consultar a ficha.",
        );
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }
  const preparationDirty = useRef(false);
  function close() {
    if (
      preparationDirty.current &&
      !window.confirm("Sair sem salvar o modo de preparo?")
    )
      return;
    detailController.current?.abort();
    setSelected(null);
    setDetail(null);
  }
  useEffect(() => {
    if (session && unit) void load();
    return () => {
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [session?.user.id, unit?.id, unit?.syncedAt]);
  const filtered = records
    .filter(
      (r) =>
        (status === "all" || r.status === Number(status)) &&
        searchText(`${r.name} ${r.code} ${r.id}`).includes(searchText(search)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24)),
    currentPage = Math.min(page, pageCount),
    visible = filtered.slice((currentPage - 1) * 24, currentPage * 24);
  return (
    <section className="everest-page">
      {unit && (
        <button className="everest-book-back secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Livros por unidade
        </button>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> FICHAS TÉCNICAS · EVEREST
          </div>
          <h1>
            {unit ? (
              unit.name
            ) : (
              <>
                Sua operação, <em>em detalhe.</em>
              </>
            )}
          </h1>
          <p>
            {unit
              ? `Livro de receitas · Unidade ${unit.id} · Everest`
              : "Composição, rendimento e preparo. Os dados da sua cozinha, reunidos."}
          </p>
        </div>
        {session && (
          <button className="secondary" disabled={syncing} onClick={onSync}>
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            Atualizar esta unidade
          </button>
        )}
      </div>
      {session && (
        <>
          <SyncNotice job={job} />
          {syncError && (
            <p className="everest-error" role="alert">
              {syncError}
            </p>
          )}
        </>
      )}
      {!session ? (
        <div className="everest-locked">
          <div className="everest-lock-icon">
            <LockKeyhole size={30} />
          </div>
          <div className="eyebrow">CONECTADO À SUA OPERAÇÃO</div>
          <h2>
            As fichas da sua cozinha.
            <br />
            <em>No lugar certo.</em>
          </h2>
          <p>
            Entre na sua conta para consultar
            <br />
            as fichas técnicas cadastradas no Everest.
          </p>
          <button className="primary" onClick={onLogin}>
            Entrar para consultar <ArrowRight size={17} />
          </button>
          <span className="everest-lock-note">
            <Cloud size={14} />
            Biblioteca salva e atualizada por você
          </span>
        </div>
      ) : (
        <>
          <div className="everest-connection">
            <span className="everest-source">
              <Cloud size={19} />
              <strong>Everest</strong>
              <span>
                {environment === "homologation" ? "Homologação" : "Produção"}
              </span>
            </span>
            <span>
              {loading ? (
                <>
                  <LoaderCircle size={13} className="spin" />
                  Abrindo a cópia salva…
                </>
              ) : error ? (
                "Consulta interrompida"
              ) : updated ? (
                <>
                  <CheckCircle2 size={13} />
                  Última atualização: {date(updated)} às{" "}
                  {new Date(updated).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              ) : (
                "Aguardando primeira sincronização"
              )}
            </span>
          </div>
          {!unit?.syncedAt && !loading && !error && (
            <div className="everest-first-sync">
              <BookOpen size={24} />
              <h3>Seu livro está sendo preparado</h3>
              <p>
                A primeira sincronização pode demorar, pois inclui os custos de
                cada ficha. Depois dela, este livro abrirá direto da cópia
                salva.
              </p>
            </div>
          )}
          <div className="everest-stats">
            <div>
              <span>
                Fichas {loading || error ? "carregadas" : "disponíveis"}
              </span>
              <strong>{records.length.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <span>Fichas ativas</span>
              <strong>
                {records
                  .filter((r) => r.status === 1)
                  .length.toLocaleString("pt-BR")}
              </strong>
            </div>
            <div>
              <span>Com rendimento em kg</span>
              <strong>
                {records
                  .filter((r) => r.yieldKg !== null)
                  .length.toLocaleString("pt-BR")}
              </strong>
            </div>
          </div>
          {error && (
            <div className="everest-error" role="alert">
              <Cloud size={20} />
              <div>
                <strong>Não foi possível concluir a consulta.</strong>
                <p>{error}</p>
                {records.length > 0 && (
                  <p>
                    Exibindo somente as fichas já carregadas. A busca ainda não
                    inclui toda a base.
                  </p>
                )}
              </div>
              <button className="secondary" onClick={() => load()}>
                Tentar novamente
              </button>
            </div>
          )}
          <div className="everest-toolbar">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar fichas técnicas"
                placeholder="Busque pelo nome ou código da ficha..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              {search && (
                <button
                  aria-label="Limpar busca de fichas"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="everest-filter">
              Situação
              <select
                aria-label="Filtrar situação das fichas"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todas as situações</option>
                <option value="1">Ativas</option>
                <option value="3">Inativas</option>
              </select>
            </label>
          </div>
          <div className="everest-results-label">
            <span>
              {filtered.length}{" "}
              {filtered.length === 1
                ? "ficha encontrada"
                : "fichas encontradas"}
            </span>
            <span>
              {loading
                ? "Busca nas fichas já carregadas"
                : "Dados do cadastro Everest"}
            </span>
          </div>
          {loading && !records.length ? (
            <div className="empty">
              <LoaderCircle className="spin" size={30} />
              <h3>Abrindo suas fichas…</h3>
              <p>A consulta pode levar alguns segundos.</p>
            </div>
          ) : !visible.length && !error && unit?.syncedAt ? (
            <div className="empty">
              <ClipboardList size={35} />
              <h3>
                {search || status !== "all"
                  ? "Nenhuma ficha encontrada."
                  : "Nenhuma ficha disponível."}
              </h3>
              <p>
                {search || status !== "all"
                  ? "Experimente outro nome, código ou situação."
                  : "As fichas cadastradas no Everest aparecerão aqui."}
              </p>
              {(search || status !== "all") && (
                <button
                  className="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="everest-records">
              {visible.map((r) => (
                <button
                  key={r.id}
                  className="everest-record"
                  onClick={() => open(r)}
                  aria-label={`Ver ficha ${r.name}`}
                >
                  <span className="everest-record-icon">
                    <ClipboardList size={22} strokeWidth={1.4} />
                  </span>
                  <div className="everest-record-name">
                    <span className="everest-code">
                      {r.code || `#${r.id}`} · V{r.version ?? "—"}
                    </span>
                    <h3>{r.name}</h3>
                    <span>
                      {r.componentCount}{" "}
                      {r.componentCount === 1 ? "componente" : "componentes"} ·
                      Atualizada em {date(r.versionDate)}
                    </span>
                  </div>
                  <div className="everest-record-yield">
                    <span>RENDIMENTO</span>
                    <strong>
                      {r.yieldKg !== null
                        ? `${numeric(r.yieldKg)} kg`
                        : "Kg não informado"}
                    </strong>
                    {r.yieldKg === null && (
                      <small>
                        {formatQuantity(r.quantity)}{" "}
                        {r.unit || "unidade não informada"} no Everest
                      </small>
                    )}
                  </div>
                  <span
                    className={`everest-status ${r.status === 1 ? "active" : ""}`}
                  >
                    {statusName(r.status)}
                  </span>
                  <ArrowRight className="everest-open-arrow" size={18} />
                </button>
              ))}
            </div>
          )}
          {filtered.length > 24 && (
            <div className="everest-pagination">
              <span>
                Página {currentPage} de {pageCount}
              </span>
              <div>
                <button
                  className="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ArrowLeft size={15} />
                  Anterior
                </button>
                <button
                  className="secondary"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Próxima
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
          <p className="everest-footnote">
            Cópia salva dos itens vinculados a esta unidade no Everest. Use
            Atualizar esta unidade para buscar mudanças de fichas e preços.
            Itens compartilhados podem aparecer em mais de um livro. Para
            alterar o cadastro de origem, utilize o Everest.
          </p>
        </>
      )}
      {selected &&
        createPortal(
          <Modal onClose={close} wide>
            <div className="everest-detail">
              <div className="eyebrow">FICHA TÉCNICA · EVEREST</div>
              <h2>{selected.name}</h2>
              <p className="everest-detail-code">
                {unit?.name} · Código {selected.code || "—"} · Ficha #
                {selected.id}
              </p>
              {detailLoading ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  <p>Abrindo a composição salva…</p>
                </div>
              ) : detailError ? (
                <div className="empty" role="alert">
                  <Cloud />
                  <p>{detailError}</p>
                  <button className="secondary" onClick={() => open(selected)}>
                    Tentar novamente
                  </button>
                </div>
              ) : (
                detail &&
                unit && (
                  <EverestPreparation
                    key={`${unit.id}-${detail.id}`}
                    detail={detail}
                    unit={unit}
                    onDirty={(dirty) => {
                      preparationDirty.current = dirty;
                    }}
                  >
                    <div className="everest-detail-actions">
                      <span
                        className={`everest-status ${detail.status === 1 ? "active" : ""}`}
                      >
                        {statusName(detail.status)}
                      </span>
                    </div>
                    <div className="detail-summary">
                      <div>
                        <span>Rendimento em kg</span>
                        <strong>
                          {detail.yieldKg === null
                            ? "Não informado"
                            : `${numeric(detail.yieldKg)} kg`}
                        </strong>
                      </div>
                      <div>
                        <span>Produção no Everest</span>
                        <strong>
                          {formatQuantity(detail.quantity)} {detail.unit || "—"}
                        </strong>
                      </div>
                      <div>
                        <span>Versão</span>
                        <strong>{detail.version ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Data da versão</span>
                        <strong>{date(detail.versionDate)}</strong>
                      </div>
                    </div>
                    {detail.yieldKg === null && (
                      <div className="everest-unit-note">
                        <Scale size={17} />
                        <p>
                          O Everest informa a produção em{" "}
                          {detail.unit || "outra unidade"}. O peso final em kg
                          não foi fornecido.
                        </p>
                      </div>
                    )}
                    <div className="everest-cost-summary">
                      <div>
                        <span>
                          {detail.costStatus === "review"
                            ? "Total calculado · conferir"
                            : "Custo total da ficha"}
                        </span>
                        <strong>{money(detail.totalCost)}</strong>
                        <small>Para o rendimento desta receita</small>
                      </div>
                      <div>
                        <span>Custo por kg pronto</span>
                        <strong>{money(detail.costPerKg)}</strong>
                        <small>{unit?.name}</small>
                      </div>
                    </div>
                    {detail.costStatus !== "available" && (
                      <div className="everest-cost-warning" role="status">
                        <p>
                          {detail.costStatus === "version_mismatch"
                            ? "O Everest retornou custos de outra versão. Os preços desta ficha não puderam ser confirmados."
                            : detail.costStatus === "review"
                              ? "Há ingredientes com custo zerado ou sem custo médio de estoque no Everest. Confira os itens abaixo: o total usa apenas os custos disponíveis na origem."
                              : detail.costStatus === "partial"
                                ? "Alguns custos não foram informados pelo Everest. O total fica pendente até a consulta estar completa."
                                : "Não foi possível obter os custos desta unidade agora."}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => open(selected)}
                        >
                          <RefreshCw size={14} /> Reabrir custos salvos
                        </button>
                      </div>
                    )}
                    <div className="everest-composition-heading">
                      <h3>Composição da ficha</h3>
                      <span>{detail.components.length} itens</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Ingrediente / componente</th>
                            <th>Quantidade</th>
                            <th>Unidade</th>
                            <th>Aproveitamento</th>
                            <th>Custo aplicado / unidade</th>
                            <th>Custo na receita</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.components.map((i, index) => (
                            <tr key={`${i.itemId}-${index}`}>
                              <td>
                                <strong>{i.name}</strong>
                                <small>
                                  {i.code}
                                  {i.costBasis === "composition"
                                    ? " · Preparo composto"
                                    : ""}
                                  {i.type === 280 ? " · Embalagem" : ""}
                                </small>
                              </td>
                              <td data-label="Quantidade">
                                {formatQuantity(i.quantity)}
                              </td>
                              <td data-label="Unidade">{i.unit || "—"}</td>
                              <td data-label="Aproveitamento">
                                {i.utilization === null
                                  ? "—"
                                  : `${numeric(i.utilization)}%`}
                              </td>
                              <td
                                className="everest-money"
                                data-label="Custo aplicado / unidade"
                              >
                                {money(i.unitCost)}
                                <small>
                                  {i.unitCost != null
                                    ? `por ${i.unit.trim().toLowerCase() || "unidade"}`
                                    : ""}
                                </small>
                                {i.costBasis === "composition" && (
                                  <small className="everest-cost-basis">
                                    Calculado pelos ingredientes
                                  </small>
                                )}
                                {i.appliedCost === 0 &&
                                  (i.quantity || 0) > 0 && (
                                    <small className="everest-cost-basis">
                                      Custo zerado na origem
                                    </small>
                                  )}
                              </td>
                              <td
                                className="everest-money"
                                data-label="Custo na receita"
                              >
                                {money(i.appliedCost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!detail.components.length && (
                        <p className="everest-no-data">
                          Nenhum componente informado nesta ficha.
                        </p>
                      )}
                    </div>
                    <p className="everest-cost-note">
                      Custo aplicado por unidade = custo na receita ÷ quantidade
                      usada. Preparos são calculados pelos seus ingredientes,
                      incluindo os preparos internos. O total soma os custos da
                      receita uma única vez. Os valores usam os dados do Everest
                      desta unidade.
                    </p>
                    {detail.costAudit && (
                      <details className="everest-cost-audit">
                        <summary>Conferência dos custos</summary>
                        <p>
                          O custo aplicado pode diferir do custo médio de
                          estoque, especialmente em preparos produzidos na
                          cozinha. Ele considera os custos dos ingredientes e as
                          quantidades da composição retornada pelo Everest.
                        </p>
                        <dl>
                          <div>
                            <dt>Soma dos itens desta receita</dt>
                            <dd>{money(detail.totalCost)}</dd>
                          </div>
                          <div>
                            <dt>Total do cabeçalho Everest</dt>
                            <dd>{money(detail.costAudit.sourceTotal)}</dd>
                          </div>
                        </dl>
                        {detail.costAudit.difference !== null &&
                          Math.abs(detail.costAudit.difference) > 0.01 && (
                            <p className="everest-audit-difference">
                              Diferença de {money(detail.costAudit.difference)}{" "}
                              em relação ao cabeçalho do Everest. O total
                              exibido acima inclui todos os ingredientes dos
                              preparos; o cabeçalho pode omitir esses níveis.
                            </p>
                          )}
                        {detail.costAudit.zeroCostItems.length > 0 && (
                          <>
                            <h4>Ingredientes com custo zerado no Everest</h4>
                            <p>
                              Confirme os custos destes itens na unidade. O
                              valor zero não confirma que o ingrediente é
                              gratuito.
                            </p>
                            <ul>
                              {detail.costAudit.zeroCostItems.map((name) => (
                                <li key={name}>{name}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {detail.costAudit.missingCostItems.length > 0 && (
                          <>
                            <h4>Custos que não puderam ser confirmados</h4>
                            <ul>
                              {detail.costAudit.missingCostItems.map((name) => (
                                <li key={name}>{name}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {detail.costAudit.stocklessCostItems.length > 0 && (
                          <>
                            <h4>Custo aplicado sem custo médio de estoque</h4>
                            <ul>
                              {detail.costAudit.stocklessCostItems.map(
                                (name) => (
                                  <li key={name}>{name}</li>
                                ),
                              )}
                            </ul>
                          </>
                        )}
                      </details>
                    )}
                    {detail.notes && (
                      <div className="notes">
                        <h4>Observações</h4>
                        <p>{detail.notes}</p>
                      </div>
                    )}
                    <div className="everest-additional">
                      <span>
                        Liberação para produção:{" "}
                        <strong>
                          {detail.released ? "Liberada" : "Não liberada"}
                        </strong>
                      </span>
                      <span>
                        Validade:{" "}
                        <strong>
                          {detail.shelfLifeDays === null
                            ? "Não informada"
                            : `${numeric(detail.shelfLifeDays)} dias`}
                        </strong>
                      </span>
                    </div>
                  </EverestPreparation>
                )
              )}
            </div>
          </Modal>,
          document.body,
        )}
    </section>
  );
}

export function Everest({
  session,
  onLogin,
}: {
  session: Session | null;
  onLogin: () => void;
}) {
  const [sharedBook, setSharedBook] = useState<string | null>(null);
  const [units, setUnits] = useState<EverestUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<EverestUnit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [job, setJob] = useState<EverestSyncJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [syncError, setSyncError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const syncControllerRef = useRef<AbortController | null>(null);
  const syncing =
    starting || job?.status === "queued" || job?.status === "running";
  async function loadUnits(silent = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await request<
        EverestCollection<EverestUnit> & { job: EverestSyncJob | null }
      >(new URLSearchParams({ kind: "units" }), controller.signal);
      if (controller.signal.aborted) return;
      setUnits(data.records);
      setJob(data.job);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível abrir os livros salvos.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function startSync(unitId: number | null) {
    if (syncing) return;
    const controller = new AbortController();
    syncControllerRef.current = controller;
    setStarting(true);
    setSyncError("");
    try {
      const data = await request<{ job: EverestSyncJob }>(
        new URLSearchParams(),
        controller.signal,
        { unitId },
      );
      if (!controller.signal.aborted) setJob(data.job);
    } catch (e) {
      if (!controller.signal.aborted)
        setSyncError(
          e instanceof Error
            ? e.message
            : "Não foi possível iniciar a atualização.",
        );
    } finally {
      if (!controller.signal.aborted) setStarting(false);
    }
  }
  useEffect(() => {
    if (session) void loadUnits();
    return () => {
      controllerRef.current?.abort();
      syncControllerRef.current?.abort();
    };
  }, [session?.user.id]);
  useEffect(() => {
    if (!session || !syncing) return;
    const timer = setInterval(() => {
      void loadUnits(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [session?.user.id, syncing]);
  if (!session) return <UnitRecipes session={null} onLogin={onLogin} />;
  if (sharedBook)
    return (
      <SharedBook
        key={`${sharedBook}-${session.user.id}`}
        bookId={sharedBook}
        session={session}
        onBack={() => setSharedBook(null)}
      />
    );
  if (selectedUnit)
    return (
      <UnitRecipes
        key={selectedUnit.id}
        session={session}
        onLogin={onLogin}
        unit={units.find((u) => u.id === selectedUnit.id) || selectedUnit}
        onSync={() => startSync(selectedUnit.id)}
        syncing={syncing}
        job={job}
        syncError={syncError}
        onBack={() => setSelectedUnit(null)}
      />
    );
  const visible = units.filter((u) =>
    searchText(`${u.name} ${u.id}`).includes(searchText(query)),
  );
  return (
    <section className="everest-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> FICHAS TÉCNICAS
          </div>
          <h1>
            Cada unidade,
            <br />
            <em>seu livro.</em>
          </h1>
          <p>Receitas das unidades e livros compartilhados da equipe.</p>
        </div>
        <button
          className="secondary"
          disabled={syncing}
          onClick={() => startSync(null)}
        >
          <RefreshCw size={16} className={syncing ? "spin" : ""} /> Atualizar
          todas
        </button>
      </div>
      <SharedBookShelf onOpen={setSharedBook} query={query} />
      <SyncNotice job={job} />
      {syncError && (
        <p className="everest-error" role="alert">
          {syncError}
        </p>
      )}
      <div className="everest-books-toolbar">
        <span>
          <Building2 size={18} /> {units.length} unidades{" "}
          {loading || error ? "carregadas" : "na sua biblioteca"}
        </span>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar unidade"
            placeholder="Encontre um livro ou unidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="everest-error" role="alert">
          <div>
            <strong>Não foi possível abrir os livros do Everest.</strong>
            <p>{error}</p>
          </div>
          <button className="secondary" onClick={() => loadUnits(true)}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading && !units.length ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          <h3>Preparando sua biblioteca…</h3>
        </div>
      ) : (
        <div className="everest-books">
          {visible.map((unit, index) => (
            <button
              key={unit.id}
              className={`everest-unit-book tone-${index % 3}`}
              aria-label={`Abrir livro ${unit.name}`}
              onClick={() => setSelectedUnit(unit)}
            >
              <div className="everest-book-cover">
                <div className="everest-book-top">
                  <span>LE CHEF</span>
                  <BookOpen size={22} />
                </div>
                <div className="everest-book-title">
                  <span>LIVRO DE RECEITAS</span>
                  <h2>{unit.name}</h2>
                </div>
                <div className="everest-book-bottom">
                  <span>UNIDADE {String(unit.id).padStart(2, "0")}</span>
                  <span>EVEREST</span>
                </div>
              </div>
              <div className="everest-book-caption">
                <span>
                  {unit.syncedAt
                    ? `${unit.recipeCount} fichas · ${date(unit.syncedAt)}`
                    : "Primeira sincronização pendente"}
                </span>
                <ArrowRight size={18} />
              </div>
            </button>
          ))}
        </div>
      )}
      {!loading && !error && !visible.length && (
        <div className="empty">
          <BookOpen />
          <h3>
            {query
              ? "Nenhuma unidade encontrada"
              : "Nenhuma unidade cadastrada"}
          </h3>
          <p>
            {query
              ? "Tente outro nome ou código."
              : "As unidades aparecerão aqui conforme o cadastro no Everest."}
          </p>
        </div>
      )}
      <p className="everest-footnote">
        Um livro para cada unidade do Everest. As fichas são organizadas pelos
        vínculos dos itens no cadastro de origem. Os dados só mudam quando você
        solicita uma atualização.
      </p>
    </section>
  );
}
