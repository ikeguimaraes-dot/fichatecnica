import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
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
} from "./everest-types";
const numeric = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(n);
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
export function Everest({
  session,
  onLogin,
}: {
  session: Session | null;
  onLogin: () => void;
}) {
  const [records, setRecords] = useState<EverestRecord[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState({ page: 0, total: 0 }),
    [updated, setUpdated] = useState(""),
    [environment, setEnvironment] = useState("production");
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
        for (const r of data.records) rows.set(r.id, r);
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
  async function open(record: EverestRecord) {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelected(record);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await request<{ record: EverestDetail }>(
        new URLSearchParams({ id: String(record.id) }),
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
    if (session) void load();
    return () => {
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [session?.user.id]);
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
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span /> FICHAS TÉCNICAS · EVEREST
          </div>
          <h1>
            Sua operação, <em>em detalhe.</em>
          </h1>
          <p>
            Composição, rendimento e preparo. Os dados da sua cozinha, reunidos.
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
                    ? `${progress.page} de ${progress.total} páginas`
                    : "fichas…"}
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
            Fichas consultadas no Everest. Para alterar o cadastro de origem,
            utilize o Everest.
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
                Código {selected.code || "—"} · Ficha #{selected.id}
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
                              <td>{numeric(i.quantity)}</td>
                              <td>{i.unit || "—"}</td>
                              <td>
                                {i.utilization === null
                                  ? "—"
                                  : `${numeric(i.utilization)}%`}
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
                      Custos não informados pelo Everest nesta consulta.
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
