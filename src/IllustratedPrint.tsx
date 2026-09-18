import type { Ref } from "react";
import { ChefHat } from "lucide-react";
import type { Content } from "./EverestPreparation";
import type { EverestDetail, EverestUnit } from "./everest-types";
import "./illustrated-print.css";

const quantity = (value: number | null) =>
  value == null
    ? "—"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export function IllustratedPrint({
  detail,
  unit,
  content,
  photos,
  compact,
  paperRef,
  loading,
  error,
}: {
  detail: EverestDetail;
  unit: EverestUnit;
  content: Content;
  photos: Record<string, string>;
  compact: boolean;
  paperRef?: Ref<HTMLElement>;
  loading: boolean;
  error: boolean;
}) {
  return (
    <article
      ref={paperRef}
      className={`prep-paper illustrated-paper ${compact ? "compact" : ""}`}
      aria-label="Manual ilustrado em A4"
    >
      <div className="illustrated-masthead">
        <strong>LE CHEF</strong>
        <span>MANUAL ILUSTRADO DE PREPARO</span>
        <span>{unit.name}</span>
      </div>
      <h1 className="illustrated-title">{detail.name}</h1>
      <div className="illustrated-overview">
        <figure className="illustrated-dish">
          {content.finalPhoto && photos[content.finalPhoto] ? (
            <img src={photos[content.finalPhoto]} alt="Prato final" />
          ) : (
            <div className="illustrated-no-photo">
              <ChefHat size={32} />
              <span>Foto do prato ainda não cadastrada</span>
            </div>
          )}
          <figcaption>APRESENTAÇÃO DO PRATO</figcaption>
        </figure>
        <section className="illustrated-ingredients">
          <div className="illustrated-facts">
            <span>
              Rendimento{" "}
              <b>
                {detail.yieldKg == null
                  ? "Não informado"
                  : `${quantity(detail.yieldKg)} kg`}
              </b>
            </span>
            {detail.shelfLifeDays != null && (
              <span>
                Validade <b>{detail.shelfLifeDays} dias</b>
              </span>
            )}
          </div>
          <h2>Ingredientes e quantidades</h2>
          <div className="illustrated-ingredient-grid">
            {detail.components.map((item, index) => (
              <div className="illustrated-ingredient" key={index}>
                <span>{item.name}</span>
                <b>
                  {quantity(item.quantity)} {item.unit}
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="illustrated-method">
        <h2>Ordem de preparo</h2>
        {loading ? (
          <p>Carregando preparo…</p>
        ) : error ? (
          <p>Preparo indisponível. Reabra a ficha antes de imprimir.</p>
        ) : content.steps.length ? (
          <ol
            className="illustrated-step-grid"
            style={{
              gridTemplateColumns: `repeat(${Math.min(content.steps.length, 6)}, minmax(0, 1fr))`,
            }}
          >
            {content.steps.map((step, index) => (
              <li key={index}>
                <div className="illustrated-step-heading">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {step.title && <b>{step.title}</b>}
                </div>
                {!!step.photos.length && (
                  <div className="illustrated-step-photos">
                    {step.photos.map((path, photoIndex) =>
                      photos[path] ? (
                        <span className="illustrated-photo-frame" key={path}>
                          <img
                            src={photos[path]}
                            alt={`Etapa ${index + 1}, foto ${photoIndex + 1}`}
                          />
                        </span>
                      ) : (
                        <span key={path}>Foto indisponível</span>
                      ),
                    )}
                  </div>
                )}
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {detail.instructions || "Modo de preparo ainda não cadastrado."}
          </p>
        )}
      </section>
      {detail.notes && (
        <section className="illustrated-notes">
          <h2>Observações da cozinha</h2>
          <p>{detail.notes}</p>
        </section>
      )}
      <footer>
        LE CHEF · {unit.name} · Manual de preparo · Rendimento em kg
      </footer>
    </article>
  );
}
