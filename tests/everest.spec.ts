import { test, expect } from "@playwright/test";
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
    },
  ],
};
async function login(page: any) {
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
  await page.route("**/rest/v1/**", (route: any) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/auth/v1/user", (route: any) =>
    route.fulfill({ json: { id: "owner", email: "owner@example.com" } }),
  );
}
async function mockUnits(page: any) {
  await page.route(
    (url: URL) =>
      url.pathname === "/api/everest" && url.searchParams.has("kind"),
    (route: any) => {
      const url = new URL(route.request().url());
      const records =
        url.searchParams.get("kind") === "units"
          ? [
              { id: 1, name: "MEET & EAT" },
              { id: 3, name: "MADONNA CUCINA" },
            ]
          : [{ itemId: url.searchParams.get("unit") === "3" ? 24 : 23 }];
      return route.fulfill({
        json: {
          records,
          page: 1,
          totalPages: 1,
          environment: "production",
          fetchedAt: "2026-09-16T14:00:00Z",
        },
      });
    },
  );
}
test("menu existe e visitante precisa entrar", async ({ page }) => {
  await mockUnits(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar para consultar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entrar para consultar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("lista todas as páginas, busca, detalhes e unidade preservada", async ({
  page,
}) => {
  await login(page);
  const seen: string[] = [];
  await page.route("**/api/everest?**", (route) => {
    const url = new URL(route.request().url());
    seen.push(url.search);
    if (url.searchParams.has("id"))
      return route.fulfill({
        json: {
          record:
            url.searchParams.get("id") === "13"
              ? {
                  ...detail,
                  id: 13,
                  name: "CALDO",
                  unit: "L",
                  quantity: 1,
                  yieldKg: null,
                }
              : detail,
        },
      });
    return route.fulfill({
      json: {
        records:
          url.searchParams.get("page") === "2"
            ? [
                {
                  ...record,
                  id: 13,
                  code: "500002",
                  name: "CALDO",
                  unit: "L",
                  quantity: 1,
                  yieldKg: null,
                  status: 3,
                },
              ]
            : [record],
        page: Number(url.searchParams.get("page")),
        totalPages: 2,
        environment: "production",
        fetchedAt: "2026-09-16T14:00:00Z",
      },
    });
  });
  await mockUnits(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.locator(".everest-record")).toHaveCount(2);
  expect(seen).toContain("?page=2");
  await page.getByLabel("Buscar fichas técnicas").fill("massa");
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await expect(page.getByRole("dialog")).toContainText("0,5 kg");
  await expect(page.getByRole("dialog")).toContainText("Farinha");
  await expect(page.locator(".everest-cost-summary")).toContainText("5,00");
  await expect(page.locator(".everest-money").first()).toContainText("20,00");
  await expect(page.getByRole("dialog")).toContainText(
    "Misture e sove a massa.",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Farinha", { exact: true })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  expect(seen).toContain("?id=12&unit=1");
  await page.getByLabel("Fechar janela").click();
  await page.getByLabel("Limpar busca de fichas").click();
  await page.getByLabel("Filtrar situação das fichas").selectOption("3");
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await page.getByRole("button", { name: "Ver ficha CALDO" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "O peso final em kg não foi fornecido.",
  );
});
test("erro na segunda página deixa claro que a lista está incompleta e permite tentar novamente", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/everest?**", (route) =>
    new URL(route.request().url()).searchParams.get("page") === "2"
      ? route.fulfill({ status: 502, json: { error: "Everest indisponível" } })
      : route.fulfill({
          json: {
            records: [record],
            page: 1,
            totalPages: 2,
            environment: "production",
            fetchedAt: "2026-09-16T14:00:00Z",
          },
        }),
  );
  await mockUnits(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "A busca ainda não inclui toda a base.",
  );
  await expect(
    page.getByRole("button", { name: "Tentar novamente", exact: true }),
  ).toBeVisible();
});
test("layout da consulta e detalhe no celular", async ({ page }) => {
  await login(page);
  await page.route("**/api/everest?**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("id")
        ? { record: detail }
        : {
            records: [
              record,
              {
                ...record,
                id: 14,
                name: "MOLHO DE TOMATES ASSADOS",
                yieldKg: 2.5,
              },
            ],
            page: 1,
            totalPages: 1,
            environment: "production",
            fetchedAt: "2026-09-16T14:00:00Z",
          },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockUnits(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.locator(".everest-record")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/everest-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/everest-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }).click();
  await expect(page.getByRole("dialog")).toContainText("Farinha");
  await expect(page.locator(".everest-cost-summary")).toContainText("5,00");
  await expect(page.locator(".everest-money").first()).toContainText("20,00");
  await page.screenshot({
    path: "test-results/everest-detail-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("livros isolam fichas pelos itens da unidade e voltar permite trocar de livro", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/everest?**", (route) =>
    route.fulfill({
      json: {
        records: [
          record,
          { ...record, id: 30, itemId: 24, name: "RECEITA MADONNA" },
        ],
        page: 1,
        totalPages: 1,
        environment: "production",
        fetchedAt: "2026-09-16T14:00:00Z",
      },
    }),
  );
  await mockUnits(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await expect(page.locator(".everest-unit-book")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/unit-books-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/unit-books-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await expect(page.locator(".everest-record")).toContainText("MASSA FRESCA");
  await page.getByRole("button", { name: "Livros por unidade" }).click();
  await page.getByLabel("Buscar unidade").fill("madonna");
  await expect(page.locator(".everest-unit-book")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Abrir livro MADONNA CUCINA", exact: true })
    .click();
  await expect(page.locator(".everest-record")).toHaveCount(1);
  await expect(page.locator(".everest-record")).toContainText(
    "RECEITA MADONNA",
  );
  await expect(
    page.getByRole("button", { name: "Ver ficha MASSA FRESCA" }),
  ).toHaveCount(0);
});
test("não mostra fichas globais se os vínculos da unidade falharem", async ({
  page,
}) => {
  await login(page);
  await mockUnits(page);
  await page.route(
    (url: URL) => url.searchParams.get("kind") === "members",
    (route) =>
      route.fulfill({ status: 502, json: { error: "Falha nos vínculos" } }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Falha nos vínculos");
  await expect(page.locator(".everest-record")).toHaveCount(0);
});

test("lê todas as páginas de vínculos antes de filtrar o livro", async ({
  page,
}) => {
  await login(page);
  await mockUnits(page);
  const seen: string[] = [];
  await page.route("**/api/everest?**", async (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get("kind");
    if (kind === "units") return route.fallback();
    seen.push(url.search);
    const current = Number(url.searchParams.get("page"));
    return route.fulfill({
      json: {
        records:
          kind === "members"
            ? [{ itemId: current === 1 ? 999 : 23 }]
            : [record],
        page: current,
        totalPages: kind === "members" ? 2 : 1,
        environment: "production",
        fetchedAt: "2026-09-16T14:00:00Z",
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Abrir livro MEET & EAT", exact: true })
    .click();
  await expect(page.locator(".everest-record")).toHaveCount(1);
  expect(seen).toEqual([
    "?kind=members&unit=1&page=1",
    "?kind=members&unit=1&page=2",
    "?page=1",
  ]);
});
