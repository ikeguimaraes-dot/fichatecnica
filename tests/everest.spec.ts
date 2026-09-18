import { test, expect, type Page } from "@playwright/test";
const snapshot = "11111111-1111-4111-8111-111111111111";
const record = {
  id: 12,
  itemId: 23,
  code: "500001",
  name: "MASSA FRESCA",
  unit: "KG",
  quantity: 0.5,
  yieldKg: 0.5,
  version: 2,
  versionDate: "2026-09-16",
  status: 1,
  released: true,
  componentCount: 1,
};
const detail = {
  ...record,
  packaging: "QUILOGRAMA",
  instructions: "Misture e sove a massa.",
  notes: "Manter refrigerado.",
  shelfLifeDays: 2,
  costStatus: "available",
  totalCost: 5,
  costPerKg: 10,
  costAudit: null,
  components: [
    {
      itemId: 7,
      code: "001",
      name: "Farinha",
      packaging: "QUILOGRAMA",
      unit: "KG",
      quantity: 0.25,
      utilization: 100,
      type: 281,
      unitCost: 20,
      appliedCost: 5,
      costBasis: "everest",
      stockUnitCost: 20,
    },
  ],
};
const units = [
  {
    id: 1,
    name: "MEET & EAT",
    syncedAt: "2026-09-16T14:00:00Z",
    recipeCount: 1,
  },
  {
    id: 3,
    name: "MADONNA CUCINA",
    syncedAt: "2026-09-16T14:00:00Z",
    recipeCount: 1,
  },
];
async function login(page: Page) {
  await page.route("**/api/everest-preparation?**", (r) =>
    r.fulfill({
      json: {
        content: { steps: [], finalPhoto: null },
        revision: null,
        updatedAt: null,
        photos: {},
      },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "sb-iqgrvptrtphvbmvrqntm-auth-token",
      JSON.stringify({
        access_token: "test-token",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "owner",
          email: "owner@example.com",
          aud: "authenticated",
          role: "authenticated",
        },
      }),
    ),
  );
  await page.route("**/rest/v1/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/auth/v1/user", (r) =>
    r.fulfill({ json: { id: "owner", email: "owner@example.com" } }),
  );
}
async function menu(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
}
async function book(page: Page, name = "MEET & EAT") {
  await page
    .getByRole("button", { name: `Abrir livro ${name}`, exact: true })
    .click();
}
function saved(records = [record]) {
  return {
    records,
    page: 1,
    totalPages: 1,
    snapshotId: snapshot,
    environment: "production",
    fetchedAt: "2026-09-16T14:00:00Z",
  };
}
function job(status = "running") {
  return {
    id: "job",
    status,
    progress: "MEET & EAT · custos: 20 de 100 itens",
    error: status === "failed" ? "Consulta interrompida" : null,
    requestedUnit: 1,
    createdAt: "2026-09-16T15:00:00Z",
    finishedAt: null,
  };
}
async function standard(page: Page) {
  await page.route("**/api/everest?**", (r) => {
    const url = new URL(r.request().url());
    return r.fulfill({
      json:
        url.searchParams.get("kind") === "units"
          ? { records: units, job: null }
          : url.searchParams.has("id")
            ? { record: detail }
            : saved(
                url.searchParams.get("unit") === "3"
                  ? [{ ...record, id: 13, name: "RECEITA MADONNA" }]
                  : [record],
              ),
    });
  });
}
test("visitante precisa entrar", async ({ page }) => {
  await menu(page);
  await page.getByRole("button", { name: "Entrar para consultar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("livro e detalhes usam só a cópia salva e fixam a versão consultada", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/everest?"))
      requests.push(r.method() + " " + new URL(r.url()).search);
  });
  await menu(page);
  await book(page);
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await expect(page.locator(".everest-connection")).toContainText("16/09/2026");
  await page.getByLabel("Buscar fichas técnicas").fill("massa");
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await expect(page.getByRole("dialog")).toContainText("Farinha");
  await expect(page.locator(".everest-cost-summary")).toContainText("5,00");
  expect(requests).toEqual([
    "GET ?kind=units",
    "GET ?kind=book&unit=1",
    `GET ?id=12&unit=1&snapshot=${snapshot}`,
  ]);
  await page.emulateMedia({ media: "print" });
  await expect(
    page.locator(".prep-paper").getByText("Farinha", { exact: true }),
  ).toBeVisible();
});
test("troca de livro não mistura unidades", async ({ page }) => {
  await login(page);
  await standard(page);
  await menu(page);
  await book(page);
  await expect(page.locator(".everest-record")).toContainText("MASSA FRESCA");
  await page.getByRole("button", { name: "Livros por unidade" }).click();
  await book(page, "MADONNA CUCINA");
  await expect(page.locator(".everest-record")).toContainText(
    "RECEITA MADONNA",
  );
  await expect(
    page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }),
  ).toHaveCount(0);
});
test("atualização manual preserva o livro anterior até a publicação e troca depois", async ({
  page,
}) => {
  await login(page);
  let syncing = false,
    published = false;
  const writes: any[] = [];
  await page.route("**/api/everest?**", (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      writes.push(r.request().postDataJSON());
      syncing = true;
      return r.fulfill({ status: 202, json: { job: job() } });
    }
    if (url.searchParams.get("kind") === "units")
      return r.fulfill({
        json: {
          records: units.map((u) => ({
            ...u,
            syncedAt: published ? "2026-09-17T14:00:00Z" : u.syncedAt,
          })),
          job: syncing ? job(published ? "completed" : "running") : null,
        },
      });
    return r.fulfill({
      json: saved(
        published ? [{ ...record, name: "MASSA ATUALIZADA" }] : [record],
      ),
    });
  });
  await menu(page);
  await book(page);
  await expect(page.locator(".everest-record")).toContainText("MASSA FRESCA");
  await page.getByRole("button", { name: "Atualizar esta unidade" }).click();
  expect(writes).toEqual([{ unitId: 1 }]);
  await expect(
    page.getByRole("button", { name: "Atualizar esta unidade" }),
  ).toBeDisabled();
  await expect(page.locator(".everest-record")).toContainText("MASSA FRESCA");
  await expect(page.getByRole("status")).toContainText(
    "Você pode fechar a página",
  );
  published = true;
  await expect(page.locator(".everest-record")).toContainText(
    "MASSA ATUALIZADA",
    { timeout: 10000 },
  );
});
test("atualizar todas envia uma única solicitação e permite acompanhar após recarregar", async ({
  page,
}) => {
  await login(page);
  let started = false;
  const writes: any[] = [];
  await page.route("**/api/everest?**", (r) => {
    if (r.request().method() === "POST") {
      started = true;
      writes.push(r.request().postDataJSON());
      return r.fulfill({ status: 202, json: { job: job() } });
    }
    return r.fulfill({ json: { records: units, job: started ? job() : null } });
  });
  await menu(page);
  await page.getByRole("button", { name: "Atualizar todas" }).click();
  expect(writes).toEqual([{ unitId: null }]);
  await page.reload();
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("custos: 20 de 100");
  await expect(
    page.getByRole("button", { name: "Atualizar todas" }),
  ).toBeDisabled();
});
test("falha da sincronização mantém a cópia salva disponível", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/everest?**", (r) =>
    r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get("kind") === "units"
          ? { records: units, job: job("failed") }
          : saved(),
    }),
  );
  await menu(page);
  await book(page);
  await expect(page.getByRole("status")).toContainText(
    "última cópia concluída",
  );
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Atualizar esta unidade" }),
  ).toBeEnabled();
});
test("primeira carga e interface móvel com custos e conferência", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  await menu(page);
  await expect(page.locator(".everest-unit-book")).toHaveCount(4);
  await page.screenshot({
    path: "test-results/snapshots-library.png",
    fullPage: true,
  });
  await book(page);
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".everest-money").first()).toContainText("20,00");
  await page.screenshot({
    path: "test-results/snapshots-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("livro sem primeira cópia informa sincronização pendente", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/everest?**", (r) =>
    r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get("kind") === "units"
          ? {
              records: units.map((u) => ({
                ...u,
                syncedAt: null,
                recipeCount: 0,
              })),
              job: job(),
            }
          : saved([]),
    }),
  );
  await menu(page);
  await book(page);
  await expect(page.getByText("Seu livro está sendo preparado")).toBeVisible();
  await expect(page.locator(".everest-record")).toHaveCount(0);
});

const photoPath = "1/12/11111111-1111-4111-8111-111111111111.jpg";
const tinyPhoto =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=";
async function openPreparation(page: Page) {
  await menu(page);
  await book(page);
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await page.getByRole("tab", { name: "Modo de preparo" }).click();
}
test("preparo salva etapas, reordena e preserva ao reabrir; fotos ampliam e A4 tem uma página", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  let stored: any = {
    content: {
      steps: [
        {
          title: "Misturar",
          text: "Misture a farinha até obter uma massa uniforme.",
          photos: [photoPath],
        },
      ],
      finalPhoto: photoPath,
    },
    revision: "r1",
    updatedAt: null,
    photos: { [photoPath]: tinyPhoto },
  };
  await page.route("**/api/everest-preparation?**", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      expect(body.revision).toBe("r1");
      stored = {
        ...stored,
        content: body.content,
        revision: "r2",
        updatedAt: new Date().toISOString(),
      };
    }
    await r.fulfill({ json: stored });
  });
  await openPreparation(page);
  const thumb = page.getByRole("button", { name: "Ampliar foto 1 da etapa 1" });
  expect((await thumb.boundingBox())!.width).toBeLessThanOrEqual(100);
  await thumb.click();
  await expect(page.getByAltText("Foto do preparo ampliada")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByAltText("Foto do preparo ampliada")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Modo de preparo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar preparo" }).click();
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page.getByLabel("Título da etapa 2").fill("Descansar");
  await page
    .getByLabel("Instruções da etapa 2")
    .fill("Cubra e deixe descansar por 30 minutos.");
  await page.getByLabel("Subir etapa 2").click();
  await expect(page.getByLabel("Título da etapa 1")).toHaveValue("Descansar");
  await page.getByRole("button", { name: "Salvar preparo" }).click();
  await expect(page.getByText("Modo de preparo salvo.")).toBeVisible();
  expect(stored.content.steps[1].photos).toEqual([photoPath]);
  await page.getByLabel("Fechar janela").click();
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await page.getByRole("tab", { name: "Modo de preparo" }).click();
  await expect(page.locator(".prep-steps")).toContainText("Descansar");
  await page.screenshot({
    path: "test-results/preparation-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Prévia A4" }).click();
  const preview = page.getByRole("dialog", { name: "Prévia de impressão A4" });
  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/preparation-a4.png",
    fullPage: true,
    animations: "disabled",
  });
  const pdf = await page.pdf({
    path: "test-results/preparation-a4.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  const mediaBox = pdf
    .toString("latin1")
    .match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/);
  expect(mediaBox).not.toBeNull();
  expect(Number(mediaBox![1])).toBeCloseTo(842, 0);
  expect(Number(mediaBox![2])).toBeCloseTo(595.28, 0);
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    1,
  );
  await page.emulateMedia({ media: "screen" });
  await preview.getByRole("button", { name: "Voltar à ficha" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/preparation-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("conteúdo excessivo avisa e bloqueia impressão sem cortar o preparo", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  await page.route("**/api/everest-preparation?**", (r) =>
    r.fulfill({
      json: {
        content: {
          steps: Array.from({ length: 24 }, (_, i) => ({
            title: `Etapa ${i + 1}`,
            text: "Instrução detalhada de preparo. ".repeat(50),
            photos: [],
          })),
          finalPhoto: null,
        },
        revision: "r1",
        updatedAt: null,
        photos: {},
      },
    }),
  );
  await openPreparation(page);
  await page.getByRole("button", { name: "Prévia A4" }).click();
  const preview = page.getByRole("dialog", { name: "Prévia de impressão A4" });
  await expect(preview.getByRole("status")).toContainText(
    "Ultrapassa uma folha",
  );
  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeDisabled();
  await preview.getByRole("checkbox").check();
  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeDisabled();
  await preview.getByRole("button", { name: "Voltar à ficha" }).click();
  await page.getByRole("tab", { name: "Impressão", exact: true }).click();
  const printPanel = page.getByRole("tabpanel", { name: "Impressão" });
  await expect(printPanel.locator(".illustrated-step-grid > li")).toHaveCount(
    24,
  );
  await expect(printPanel).toContainText("O conteúdo ultrapassa uma folha");
  await expect(
    printPanel.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeDisabled();
});
test("erro de salvamento mantém rascunho e fechamento exige descarte", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  await page.route("**/api/everest-preparation?**", (r) =>
    r.request().method() === "PUT"
      ? r.fulfill({
          status: 409,
          json: { error: "Este preparo foi alterado em outra janela." },
        })
      : r.fulfill({
          json: {
            content: { steps: [], finalPhoto: null },
            revision: null,
            photos: {},
          },
        }),
  );
  await openPreparation(page);
  await page.getByRole("button", { name: "Adicionar primeira etapa" }).click();
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page
    .getByLabel("Instruções da etapa 1")
    .fill("Minha instrução preservada");
  await page.getByRole("button", { name: "Salvar preparo" }).click();
  await expect(page.getByRole("alert")).toContainText("outra janela");
  await expect(page.getByLabel("Instruções da etapa 1")).toHaveValue(
    "Minha instrução preservada",
  );
  page.once("dialog", (d) => d.dismiss());
  await page.getByLabel("Fechar janela").click();
  await expect(page.getByLabel("Instruções da etapa 1")).toBeVisible();
});
test("upload de foto usa URL assinada e salva apenas o caminho privado", async ({
  page,
}) => {
  await login(page);
  await standard(page);
  await page.route("**/api/everest-preparation?**", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ json: { path: photoPath, token: "upload-token" } })
      : r.request().method() === "PUT"
        ? r.fulfill({
            json: {
              content: r.request().postDataJSON().content,
              revision: "r1",
              updatedAt: null,
              photos: { [photoPath]: tinyPhoto },
            },
          })
        : r.fulfill({
            json: {
              content: { steps: [], finalPhoto: null },
              revision: null,
              photos: {},
            },
          }),
  );
  await page.route("**/storage/v1/object/upload/sign/**", (r) =>
    r.fulfill({ json: { Key: photoPath } }),
  );
  await openPreparation(page);
  await page.getByRole("button", { name: "Adicionar primeira etapa" }).click();
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page.getByLabel("Instruções da etapa 1").fill("Misture.");
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 20;
    c.getContext("2d")!.fillRect(0, 0, 20, 20);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Foto da etapa 1", { exact: true }).setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Ampliar foto 1 da etapa 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar preparo" }).click();
  await expect(page.getByText("Modo de preparo salvo.")).toBeVisible();
});

test("sincronização concluída mostra itens sem custo como pendência, sem falha geral", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/everest?**", (r) =>
    r.fulfill({
      json: {
        records: units,
        job: { ...job("completed"), costWarningCount: 1 },
      },
    }),
  );
  await menu(page);
  await expect(page.getByRole("status")).toContainText(
    "Atualização concluída com custos pendentes",
  );
  await expect(page.getByRole("status")).toContainText(
    "1 itens retornaram sem custos",
  );
  await expect(
    page.getByRole("button", { name: "Atualizar todas" }),
  ).toBeEnabled();
});
