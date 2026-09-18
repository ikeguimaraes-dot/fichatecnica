import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ChefHat,
  Edit3,
  Plus,
  Printer,
  Save,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { supabase } from "./supabase";
import type { EverestDetail, EverestUnit } from "./everest-types";
import "./preparation.css";
import { IllustratedPrint } from "./IllustratedPrint";
type Step = { title: string; text: string; photos: string[] };
export type Content = { steps: Step[]; finalPhoto: string | null };
export type Preparation = {
  content: Content;
  revision: string | null;
  updatedAt: string | null;
  photos: Record<string, string>;
};
export type PreparationAdapter = {
  load: () => Promise<Preparation>;
  save: (content: Content, revision: string | null) => Promise<Preparation>;
  upload: (blob: Blob) => Promise<string>;
};
const empty: Preparation = {
  content: { steps: [], finalPhoto: null },
  revision: null,
  updatedAt: null,
  photos: {},
};
const number = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const money = (n: number | null) =>
  n == null
    ? "Não informado"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 4,
      });
async function call(
  unit: number,
  id: number,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw Error("Entre novamente para acessar o preparo.");
  const response = await fetch(
    `/api/everest-preparation?unit=${unit}&id=${id}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Não foi possível acessar o preparo. Tente novamente.");
  }
  if (!response.ok) throw Error(data.error || "Não foi possível salvar.");
  return data;
}
async function compress(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw Error("Escolha uma foto JPG, PNG ou WebP de até 20 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob || blob.size > 2 * 1024 * 1024)
    throw Error("A foto ficou muito pesada. Escolha uma imagem menor.");
  return blob;
}
export function EverestPreparation({
  detail,
  unit,
  children,
  onDirty,
  adapter,
  canEdit = true,
}: {
  adapter?: PreparationAdapter;
  canEdit?: boolean;
  detail: EverestDetail;
  unit: EverestUnit;
  children: ReactNode;
  onDirty: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState("technical"),
    [saved, setSaved] = useState<Preparation>(empty),
    [draft, setDraft] = useState<Content>(empty.content);
  const [editing, setEditing] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false),
    [compact, setCompact] = useState(false),
    [fits, setFits] = useState(false),
    [lightbox, setLightbox] = useState<string | null>(null);
  const [imagesReady, setImagesReady] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview]);
  const paper = useRef<HTMLElement>(null),
    lightboxRef = useRef<HTMLDialogElement>(null),
    mounted = useRef(true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.content);
  const content = editing ? draft : saved.content;
  const showPrintCosts = tab === "technical";
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await (adapter ? adapter.load() : call(unit.id, detail.id));
      if (mounted.current) {
        setSaved(data);
        setDraft(data.content);
        setPhotos((p) => ({ ...p, ...data.photos }));
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      onDirty(false);
    };
  }, [unit.id, detail.id]);
  useEffect(() => {
    onDirty(dirty || busy);
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty || busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  useEffect(() => {
    if (lightbox) lightboxRef.current?.showModal();
  }, [lightbox]);
  useEffect(() => {
    const update = () => {
      if (paper.current)
        setFits(
          paper.current.scrollHeight <= paper.current.clientHeight + 1 &&
            paper.current.scrollWidth <= paper.current.clientWidth + 1,
        );
    };
    const checkImages = () => {
      const paths = [
        content.finalPhoto,
        ...content.steps.flatMap((s) => s.photos),
      ].filter(Boolean) as string[];
      const imgs = Array.from(paper.current?.querySelectorAll("img") || []);
      setImagesReady(
        paths.every((p) => !!photos[p]) &&
          imgs.every((i) => i.complete && i.naturalWidth > 0),
      );
    };
    const imgs = Array.from(paper.current?.querySelectorAll("img") || []);
    imgs.forEach((i) => {
      i.addEventListener("load", checkImages);
      i.addEventListener("error", checkImages);
    });
    checkImages();
    const observer = new ResizeObserver(update);
    if (paper.current) observer.observe(paper.current);
    const frame = requestAnimationFrame(update);
    void document.fonts.ready.then(update);
    return () => {
      observer.disconnect();
      imgs.forEach((i) => {
        i.removeEventListener("load", checkImages);
        i.removeEventListener("error", checkImages);
      });
      cancelAnimationFrame(frame);
    };
  }, [preview, compact, content, photos, detail, tab]);
  const change = (i: number, patch: Partial<Step>) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, j) => (i === j ? { ...s, ...patch } : s)),
    }));
  function move(i: number, by: number) {
    setDraft((d) => {
      const steps = [...d.steps];
      [steps[i], steps[i + by]] = [steps[i + by], steps[i]];
      return { ...d, steps };
    });
  }
  async function upload(file: File | undefined, index: number | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (
        draft.steps.reduce(
          (n, s) => n + s.photos.length,
          draft.finalPhoto ? 1 : 0,
        ) >= 24
      )
        throw Error(
          "Limite de 24 fotos por ficha. Remova uma foto antes de adicionar outra.",
        );
      const blob = await compress(file);
      let path: string;
      if (adapter) path = await adapter.upload(blob);
      else {
        const signed = await call(unit.id, detail.id, "POST", {
          action: "upload",
        });
        path = signed.path;
        const { error: uploadError } = await supabase.storage
          .from("receita-everest-preparo")
          .uploadToSignedUrl(path, signed.token, blob, {
            contentType: "image/jpeg",
          });
        if (uploadError)
          throw Error("Não foi possível enviar a foto. Tente novamente.");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      if (mounted.current) {
        setPhotos((p) => ({ ...p, [path]: dataUrl }));
        setDraft((d) =>
          index === null
            ? { ...d, finalPhoto: path }
            : {
                ...d,
                steps: d.steps.map((s, i) =>
                  i === index ? { ...s, photos: [...s.photos, path] } : s,
                ),
              },
        );
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await (adapter
        ? adapter.save(draft, saved.revision)
        : call(unit.id, detail.id, "PUT", {
            content: draft,
            revision: saved.revision,
          }));
      if (mounted.current) {
        setSaved(data);
        setDraft(data.content);
        setPhotos((p) => ({ ...p, ...data.photos }));
        setEditing(false);
        setNotice("Modo de preparo salvo.");
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function cancel() {
    if (dirty && !window.confirm("Descartar as alterações ainda não salvas?"))
      return;
    setDraft(saved.content);
    setEditing(false);
    setError("");
  }
  const photo = (path: string, label: string) => (
    <button
      type="button"
      className="prep-thumbnail"
      aria-label={`Ampliar ${label}`}
      onClick={() => setLightbox(path)}
    >
      {photos[path] ? (
        <img src={photos[path]} alt={label} />
      ) : (
        <span>Foto indisponível</span>
      )}
      <ZoomIn size={14} />
    </button>
  );
  const uploader = (index: number | null) => (
    <label className={`prep-upload ${busy ? "disabled" : ""}`}>
      <Camera size={17} />
      {index === null ? "Foto do prato final" : "Adicionar foto"}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        aria-label={
          index === null ? "Foto do prato final" : `Foto da etapa ${index + 1}`
        }
        onChange={(e) => {
          void upload(e.target.files?.[0], index);
          e.target.value = "";
        }}
      />
    </label>
  );
  const printPaper = (measured = true) =>
    tab === "printing" ? (
      <IllustratedPrint
        detail={detail}
        unit={unit}
        content={content}
        photos={photos}
        compact={compact}
        paperRef={measured ? paper : undefined}
        loading={loading}
        error={!!error && !editing}
      />
    ) : (
      <article
        ref={measured ? paper : undefined}
        className={`prep-paper ${compact ? "compact" : ""}`}
        aria-label="Ficha completa em A4"
      >
        <div className="prep-paper-columns">
          <section>
            <header>
              <div>
                <b className="prep-brand">LE CHEF</b>
                <span>FICHA TÉCNICA & PREPARO</span>
                <h1>{detail.name}</h1>
                <p>
                  {adapter
                    ? `${unit.name} · Receita compartilhada`
                    : `${unit.name} · Ficha #${detail.id} · V${detail.version ?? "—"}`}
                </p>
              </div>
              {content.finalPhoto && photos[content.finalPhoto] && (
                <img src={photos[content.finalPhoto]} alt="Prato final" />
              )}
            </header>
            <div className="prep-paper-metrics">
              <span>
                Rendimento{" "}
                <b>
                  {detail.yieldKg == null
                    ? "Kg não informado"
                    : `${number(detail.yieldKg)} kg`}
                </b>
              </span>
              {showPrintCosts && (
                <>
                  <span>
                    Custo total <b>{money(detail.totalCost)}</b>
                  </span>
                  <span>
                    Custo / kg <b>{money(detail.costPerKg)}</b>
                  </span>
                </>
              )}
            </div>
            {showPrintCosts && detail.costStatus !== "available" && (
              <p className="prep-paper-warning">
                {detail.costStatus === "review"
                  ? "Custos a conferir: há ingredientes zerados ou sem custo médio na origem."
                  : "Custos incompletos ou não confirmados no Everest."}
              </p>
            )}
            <h2>01 / Ingredientes</h2>
            <table>
              <thead>
                <tr>
                  <th>Ingrediente / componente</th>
                  <th>Quantidade</th>
                  {showPrintCosts && (
                    <>
                      <th>Custo / un.</th>
                      <th>Custo na receita</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.components.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td>
                      {number(c.quantity)} {c.unit}
                    </td>
                    {showPrintCosts && (
                      <>
                        <td>{money(c.unitCost)}</td>
                        <td>{money(c.appliedCost)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="prep-paper-method">
            <h2>02 / Modo de preparo</h2>
            {loading ? (
              <p>Carregando preparo…</p>
            ) : error && !editing ? (
              <p>Preparo indisponível. Reabra a ficha antes de imprimir.</p>
            ) : content.steps.length ? (
              <ol>
                {content.steps.map((s, i) => (
                  <li key={i}>
                    <div>
                      <b>
                        {String(i + 1).padStart(2, "0")}
                        {s.title ? ` · ${s.title}` : ""}
                      </b>
                      <p>{s.text}</p>
                    </div>
                    {!!s.photos.length && (
                      <div className="prep-paper-photos">
                        {s.photos.map((p, j) =>
                          photos[p] ? (
                            <img
                              key={p}
                              src={photos[p]}
                              alt={`Etapa ${i + 1}, foto ${j + 1}`}
                            />
                          ) : (
                            <span key={p}>Foto indisponível</span>
                          ),
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                {detail.instructions || "Modo de preparo ainda não cadastrado."}
              </p>
            )}
            {detail.notes && (
              <p className="prep-paper-notes">
                <b>Observações:</b> {detail.notes}
              </p>
            )}
          </section>
        </div>
        <footer>
          Le Chef · {unit.name} · Validade:{" "}
          {detail.shelfLifeDays == null
            ? "não informada"
            : `${detail.shelfLifeDays} dias`}{" "}
          ·{" "}
          {adapter
            ? "Cadastro manual · Le Chef"
            : "Custos da cópia salva do Everest"}
        </footer>
      </article>
    );
  return (
    <>
      <div className="prep-navigation">
        <div
          role="tablist"
          aria-label="Conteúdo da ficha"
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              const tabs = ["technical", "preparation", "printing"];
              const next =
                e.key === "Home"
                  ? tabs[0]
                  : e.key === "End"
                    ? tabs[2]
                    : tabs[
                        (tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) %
                          3
                      ];
              setTab(next);
              document.getElementById(`${next}-tab`)?.focus();
            }
          }}
        >
          <button
            role="tab"
            id="technical-tab"
            aria-controls="technical-panel"
            aria-selected={tab === "technical"}
            tabIndex={tab === "technical" ? 0 : -1}
            onClick={() => setTab("technical")}
          >
            Ficha técnica
          </button>
          <button
            role="tab"
            id="preparation-tab"
            aria-controls="preparation-panel"
            aria-selected={tab === "preparation"}
            tabIndex={tab === "preparation" ? 0 : -1}
            onClick={() => setTab("preparation")}
          >
            <ChefHat size={17} />
            Modo de preparo
          </button>
          <button
            role="tab"
            id="printing-tab"
            aria-controls="printing-panel"
            aria-selected={tab === "printing"}
            tabIndex={tab === "printing" ? 0 : -1}
            onClick={() => setTab("printing")}
          >
            <Printer size={17} />
            Impressão
          </button>
        </div>
        <button
          className="secondary"
          disabled={loading || busy || (!!error && !editing)}
          onClick={() => setPreview((p) => !p)}
        >
          <Printer size={16} />
          Prévia A4
        </button>
      </div>
      {tab === "printing" && (
        <section
          role="tabpanel"
          id="printing-panel"
          aria-labelledby="printing-tab"
        >
          <div className="prep-preview">
            <div>
              <strong>Ficha completa · A4 paisagem</strong>
              <p>
                {dirty
                  ? "Prévia das alterações ainda não salvas. Salve para imprimir."
                  : !imagesReady
                    ? "Aguardando fotos. Se não carregarem, reabra a ficha antes de imprimir."
                    : fits
                      ? "Receita, preparo e fotos cabem em uma página."
                      : "O conteúdo ultrapassa uma folha. Use o layout compacto, resuma as etapas ou reduza as fotos."}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={compact}
                  onChange={(e) => setCompact(e.target.checked)}
                />{" "}
                Layout compacto
              </label>
              <p className="prep-print-hint">
                Imprima em A4 paisagem, escala 100%, sem cabeçalhos e rodapés do
                navegador.
              </p>
            </div>
            <button
              className="primary"
              disabled={!fits || !imagesReady || dirty || busy || loading}
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Imprimir ficha completa
            </button>
          </div>
          <div className="prep-inline-preview">{printPaper(false)}</div>
        </section>
      )}
      <div
        role="tabpanel"
        id="technical-panel"
        aria-labelledby="technical-tab"
        hidden={tab !== "technical"}
      >
        {children}
      </div>
      <section
        className="prep-panel"
        role="tabpanel"
        id="preparation-panel"
        aria-labelledby="preparation-tab"
        hidden={tab !== "preparation"}
      >
        <div className="prep-ingredients">
          <p>
            Rendimento:{" "}
            <strong>
              {detail.yieldKg == null
                ? "não informado"
                : `${number(detail.yieldKg)} kg`}
            </strong>
          </p>
          <h3>Ingredientes</h3>
          <table>
            <thead>
              <tr>
                <th>Ingrediente / componente</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {detail.components.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td>
                    {number(c.quantity)} {c.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prep-heading">
          <div>
            <div className="eyebrow">O SABER DA SUA COZINHA</div>
            <h3>Do primeiro corte à finalização.</h3>
            <p>
              {adapter
                ? "Etapas e fotos compartilhadas com a equipe."
                : "Instruções desta unidade, preservadas a cada atualização do Everest."}
            </p>
          </div>
          {canEdit && !loading && !editing && !error && (
            <button
              className="secondary"
              onClick={() => {
                setEditing(true);
                setNotice("");
              }}
            >
              <Edit3 size={16} />
              {saved.content.steps.length
                ? "Editar preparo"
                : "Adicionar primeira etapa"}
            </button>
          )}
        </div>
        {loading ? (
          <p role="status">Abrindo modo de preparo…</p>
        ) : (
          <>
            {error && (
              <div className="everest-error" role="alert">
                {error}
                {!editing && (
                  <button className="secondary" onClick={() => void load()}>
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="prep-success" role="status">
                <Check size={16} />
                {notice}
              </p>
            )}
            {editing && (
              <p className="prep-hint">
                Escreva instruções objetivas. As fotos aparecem pequenas; clique
                para ampliar. Até 24 etapas e 24 fotos.
              </p>
            )}
            {!content.steps.length && !editing && !error && (
              <div className="prep-empty">
                <ChefHat size={32} />
                <h4>O jeito de fazer merece ser registrado.</h4>
                <p>Adicione etapas e fotos para orientar sua equipe.</p>
                {detail.instructions && (
                  <p className="prep-source">
                    <strong>Preparo informado no Everest</strong>
                    {detail.instructions}
                  </p>
                )}
              </div>
            )}
            {editing && (
              <fieldset disabled={busy} className="prep-editor">
                <ol className="prep-steps">
                  {draft.steps.map((s, i) => (
                    <li key={i}>
                      <span className="prep-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="prep-step-body">
                        <div className="prep-step-top">
                          <input
                            aria-label={`Título da etapa ${i + 1}`}
                            placeholder="Título da etapa (opcional)"
                            maxLength={100}
                            value={s.title}
                            onChange={(e) =>
                              change(i, { title: e.target.value })
                            }
                          />
                          <div className="prep-step-tools">
                            <button
                              aria-label={`Subir etapa ${i + 1}`}
                              disabled={i === 0}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              aria-label={`Descer etapa ${i + 1}`}
                              disabled={i === draft.steps.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button
                              aria-label={`Excluir etapa ${i + 1}`}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Excluir esta etapa e suas fotos do preparo?",
                                  )
                                )
                                  setDraft((d) => ({
                                    ...d,
                                    steps: d.steps.filter((_, j) => i !== j),
                                  }));
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <textarea
                          aria-label={`Instruções da etapa ${i + 1}`}
                          placeholder="Descreva o que fazer e o ponto esperado…"
                          maxLength={4000}
                          rows={3}
                          value={s.text}
                          onChange={(e) => change(i, { text: e.target.value })}
                        />
                        <div className="prep-photos">
                          {s.photos.map((p, j) => (
                            <div className="prep-photo-edit" key={p}>
                              {photo(p, `foto ${j + 1} da etapa ${i + 1}`)}
                              <button
                                aria-label={`Remover foto ${j + 1} da etapa ${i + 1}`}
                                onClick={() =>
                                  change(i, {
                                    photos: s.photos.filter((x) => x !== p),
                                  })
                                }
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {s.photos.length < 3 && uploader(i)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <button
                  className="secondary"
                  disabled={draft.steps.length >= 24}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      steps: [...d.steps, { title: "", text: "", photos: [] }],
                    }))
                  }
                >
                  <Plus size={16} />
                  Adicionar etapa
                </button>
              </fieldset>
            )}
            {!editing && (
              <ol className="prep-steps">
                {content.steps.map((s, i) => (
                  <li key={i}>
                    <span className="prep-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="prep-step-body">
                      {s.title && <h4>{s.title}</h4>}
                      <p>{s.text}</p>
                      <div className="prep-photos">
                        {s.photos.map((p, j) => (
                          <span key={p}>
                            {photo(p, `foto ${j + 1} da etapa ${i + 1}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {(editing || content.finalPhoto) && (
              <div className="prep-final">
                <div>
                  <span className="eyebrow">MONTAGEM & APRESENTAÇÃO</span>
                  <h4>Referência do prato final</h4>
                </div>
                {content.finalPhoto && photo(content.finalPhoto, "prato final")}
                {editing && (
                  <>
                    {uploader(null)}
                    {draft.finalPhoto && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          setDraft((d) => ({ ...d, finalPhoto: null }))
                        }
                      >
                        Remover foto final
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {editing && (
              <div className="prep-save">
                <span>
                  {busy
                    ? "Enviando…"
                    : dirty
                      ? "Alterações ainda não salvas"
                      : "Tudo pronto para editar"}
                </span>
                <button className="secondary" disabled={busy} onClick={cancel}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  disabled={busy || draft.steps.some((s) => !s.text.trim())}
                  onClick={() => void save()}
                >
                  <Save size={16} />
                  Salvar preparo
                </button>
              </div>
            )}
            {!editing && saved.updatedAt && (
              <p className="prep-hint">
                Preparo atualizado em{" "}
                {new Date(saved.updatedAt).toLocaleString("pt-BR")}.
              </p>
            )}
          </>
        )}
        {detail.notes && (
          <div className="notes">
            <h4>Notas da cozinha</h4>
            <p>{detail.notes}</p>
          </div>
        )}
      </section>
      {createPortal(
        <div
          ref={previewRef}
          tabIndex={-1}
          role={preview ? "dialog" : undefined}
          aria-modal={preview ? true : undefined}
          aria-label="Prévia de impressão A4"
          className={`prep-print-host ${preview ? "is-preview" : ""}`}
          onKeyDown={(e) => {
            if (!preview) return;
            if (e.key === "Escape") {
              e.stopPropagation();
              setPreview(false);
            }
            if (e.key === "Tab") {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input",
                ),
              );
              const first = items[0],
                last = items[items.length - 1];
              if (
                e.shiftKey &&
                (document.activeElement === first ||
                  document.activeElement === e.currentTarget)
              ) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <div className="prep-preview-toolbar">
            <p role="status">
              {dirty
                ? "Salve as alterações antes de imprimir."
                : !imagesReady
                  ? "Aguardando fotos. Se não carregarem, reabra a ficha antes de imprimir."
                  : fits
                    ? "Tudo cabe em uma folha A4 paisagem. Imprima em escala 100%, sem cabeçalhos e rodapés."
                    : "Ultrapassa uma folha: use o layout compacto, resuma as etapas ou reduza as fotos."}
            </p>
            <label>
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              Compacto
            </label>
            <button
              className="primary"
              disabled={!fits || !imagesReady || dirty || busy || loading}
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Imprimir ficha completa
            </button>
            <button className="secondary" onClick={() => setPreview(false)}>
              Voltar à ficha
            </button>
          </div>
          {printPaper()}
        </div>,
        document.body,
      )}
      {lightbox && (
        <dialog
          className="prep-lightbox"
          ref={lightboxRef}
          onCancel={(e) => {
            e.preventDefault();
            setLightbox(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              e.preventDefault();
              setLightbox(null);
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightbox(null);
          }}
        >
          <button
            autoFocus
            aria-label="Fechar foto ampliada"
            onClick={() => setLightbox(null)}
          >
            <X size={22} />
          </button>
          <img src={photos[lightbox]} alt="Foto do preparo ampliada" />
        </dialog>
      )}
    </>
  );
}
