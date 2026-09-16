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
  Download,
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
import type {
  EverestRecord,
  EverestDetail,
  EverestPage,
  EverestUnit,
  EverestCollection,
} from "./everest-types";
const numeric = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(n);
const money = (value: number | null | undefined, digits = 2) =>
  value == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: digits,
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
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre na sua conta para consultar o Everest.");
  const response = await fetch(`/api/everest?${params}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
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
function UnitRecipes({
  session,
  onLogin,
  unit,
  onBack,
}: {
  session: Session | null;
  onLogin: () => void;
  unit?: EverestUnit;
  onBack?: () => void;
}) {
  const [records, setRecords] = useState<EverestRecord[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState({ page: 0, total: 0 }),
    [updated, setUpdated] = useState(""),
    [environment, setEnvironment] = useState("production");
  const [phase, setPhase] = useState("fichas");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<EverestRecord | null>(null),
    [detail, setDetail] = useState<EverestDetail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState("");
  const listController = useRef<AbortController | null>(null),
    detailController = useRef<AbortController | null>(null);
  async function load(refresh = false) {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true);
    setError("");
    setRecords([]);
    setProgress({ page: 0, total: 0 });
    setUpdated("");
    setPage(1);
    try {
      const members = new Set<number>();
      if (unit) {
        setPhase("vínculos da unidade");
        let totalMembers = 1;
        for (let current = 1; current <= totalMembers; current++) {
          const params = new URLSearchParams({
            kind: "members",
            unit: String(unit.id),
            page: String(current),
          });
          if (refresh) params.set("refresh", "1");
          const data = await request<EverestCollection<{ itemId: number }>>(
            params,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (
            !Array.isArray(data.records) ||
            !Number.isSafeInteger(data.totalPages) ||
            data.totalPages < 1 ||
            data.totalPages > 100
          )
            throw new Error(
              "Os vínculos da unidade retornaram uma lista inválida.",
            );
          totalMembers = data.totalPages;
          data.records.forEach((r) => members.add(r.itemId));
          setProgress({ page: current, total: totalMembers });
          if (current < totalMembers)
            await new Promise((resolve) => setTimeout(resolve, 1100));
          if (controller.signal.aborted) return;
        }
      }
      setPhase("fichas");
      setProgress({ page: 0, total: 0 });
      let total = 1;
      const rows = new Map<number, EverestRecord>();
      for (let current = 1; current <= total; current++) {
        const params = new URLSearchParams({ page: String(current) });
        if (refresh) params.set("refresh", "1");
        const data = await request<EverestPage>(params, controller.signal);
        if (controller.signal.aborted) return;
        if (
          !Array.isArray(data.records) ||
          !Number.isSafeInteger(data.totalPages) ||
          data.totalPages < 1 ||
          data.totalPages > 100
        )
          throw new Error(
            "O Everest retornou uma lista inválida. Tente novamente.",
          );
        total = data.totalPages;
        for (const r of data.records)
          if (!unit || (r.itemId !== null && members.has(r.itemId)))
            rows.set(r.id, r);
        setRecords([...rows.values()]);
        setProgress({ page: current, total });
        setEnvironment(data.environment);
        setUpdated(data.fetchedAt);
        if (current < total)
          await new Promise((resolve) => setTimeout(resolve, 1100));
        if (controller.signal.aborted) return;
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Falha ao consultar as fichas.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function open(record: EverestRecord, refresh = false) {
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
          ...(refresh ? { refresh: "1" } : {}),
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
  function close() {
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
  }, [session?.user.id, unit?.id]);
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
          <button
            className="secondary"
            disabled={loading}
            onClick={() => load(true)}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Atualizar fichas
          </button>
        )}
      </div>
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
            Entre na sua conta autorizada para consultar
            <br />
            as fichas técnicas cadastradas no Everest.
          </p>
          <button className="primary" onClick={onLogin}>
            Entrar para consultar <ArrowRight size={17} />
          </button>
          <span className="everest-lock-note">
            <Cloud size={14} />
            Consulta direta ao Everest
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
                  Carregando{" "}
                  {progress.total
                    ? `${phase}: ${progress.page} de ${progress.total} páginas`
                    : `${phase}…`}
                </>
              ) : error ? (
                "Consulta interrompida"
              ) : updated ? (
                <>
                  <CheckCircle2 size={13} />
                  Consultado às{" "}
                  {new Date(updated).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              ) : (
                "Aguardando consulta"
              )}
            </span>
          </div>
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
              <button className="secondary" onClick={() => load(true)}>
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
          ) : !visible.length && !error ? (
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
                        {numeric(r.quantity)}{" "}
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
            Fichas dos itens vinculados a esta unidade no Everest. Itens
            compartilhados podem aparecer em mais de um livro. Para alterar o
            cadastro de origem, utilize o Everest.
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
                  <p>Consultando a composição…</p>
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
                detail && (
                  <>
                    <div className="everest-detail-actions">
                      <span
                        className={`everest-status ${detail.status === 1 ? "active" : ""}`}
                      >
                        {statusName(detail.status)}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => window.print()}
                      >
                        <Download size={15} />
                        Imprimir / PDF
                      </button>
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
                          {numeric(detail.quantity)} {detail.unit || "—"}
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
                        <span>Custo total da ficha</span>
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
                            : detail.costStatus === "partial"
                              ? "Alguns custos não foram informados pelo Everest. O total fica pendente até a consulta estar completa."
                              : "Não foi possível obter os custos desta unidade agora."}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => open(selected, true)}
                        >
                          <RefreshCw size={14} /> Consultar custos novamente
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
                            <th>Preço / unidade</th>
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
                                  {i.type === 280 ? " · Embalagem" : ""}
                                </small>
                              </td>
                              <td data-label="Quantidade">
                                {numeric(i.quantity)}
                              </td>
                              <td data-label="Unidade">{i.unit || "—"}</td>
                              <td data-label="Aproveitamento">
                                {i.utilization === null
                                  ? "—"
                                  : `${numeric(i.utilization)}%`}
                              </td>
                              <td
                                className="everest-money"
                                data-label="Preço / unidade"
                              >
                                {money(i.unitCost, 4)}
                                <small>
                                  {i.unitCost != null
                                    ? `por ${i.unit.trim().toLowerCase() || "unidade"}`
                                    : ""}
                                </small>
                              </td>
                              <td
                                className="everest-money"
                                data-label="Custo na receita"
                              >
                                {money(i.appliedCost, 4)}
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
                      Preços baseados no custo médio do Everest para esta
                      unidade. O custo na receita e o total seguem o cálculo do
                      Everest; sub-receitas não são somadas duas vezes.
                    </p>
                    <h3>Modo de preparo</h3>
                    <p
                      className={`everest-long-text ${detail.instructions ? "" : "everest-no-data"}`}
                    >
                      {detail.instructions ||
                        "O modo de preparo não foi informado no Everest."}
                    </p>
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
                  </>
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
  const [units, setUnits] = useState<EverestUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<EverestUnit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  async function loadUnits(refresh = false) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    setUnits([]);
    try {
      let total = 1;
      const all = new Map<number, EverestUnit>();
      for (let page = 1; page <= total; page++) {
        const params = new URLSearchParams({
          kind: "units",
          page: String(page),
        });
        if (refresh) params.set("refresh", "1");
        const data = await request<EverestCollection<EverestUnit>>(
          params,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          !Array.isArray(data.records) ||
          !Number.isSafeInteger(data.totalPages) ||
          data.totalPages < 1 ||
          data.totalPages > 100
        )
          throw new Error("A lista de unidades não pôde ser validada.");
        total = data.totalPages;
        data.records.forEach((u) => all.set(u.id, u));
        setUnits(
          [...all.values()].sort((a, b) =>
            a.name.localeCompare(b.name, "pt-BR"),
          ),
        );
        if (page < total)
          await new Promise((resolve) => setTimeout(resolve, 1100));
        if (controller.signal.aborted) return;
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível consultar as unidades.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (session) void loadUnits();
    return () => controllerRef.current?.abort();
  }, [session?.user.id]);
  if (!session) return <UnitRecipes session={null} onLogin={onLogin} />;
  if (selectedUnit)
    return (
      <UnitRecipes
        key={selectedUnit.id}
        session={session}
        onLogin={onLogin}
        unit={selectedUnit}
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
            <span /> FICHAS TÉCNICAS · EVEREST
          </div>
          <h1>
            Cada unidade,
            <br />
            <em>seu livro.</em>
          </h1>
          <p>Escolha uma unidade para abrir suas receitas e fichas técnicas.</p>
        </div>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => loadUnits(true)}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Atualizar
          unidades
        </button>
      </div>
      <div className="everest-books-toolbar">
        <span>
          <Building2 size={18} /> {units.length} unidades{" "}
          {loading || error ? "carregadas" : "na sua biblioteca"}
        </span>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar unidade"
            placeholder="Encontre sua unidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div className="everest-error" role="alert">
          <div>
            <strong>Não foi possível carregar todas as unidades.</strong>
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
                <span>Explorar fichas técnicas</span>
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
        vínculos dos itens no cadastro de origem.
      </p>
    </section>
  );
}
