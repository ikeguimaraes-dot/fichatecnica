import { test, expect } from "@playwright/test";
test("controle calcula consumo, limita pratos, separa unidades e salva vínculo", async ({
  page,
}) => {
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
  await page.route("**/api/everest-stock?**", (r) => {
    const kind = new URL(r.request().url()).searchParams.get("kind");
    const records =
      kind === "invoices"
        ? [
            {
              id: 1,
              unitId: 1,
              number: "10",
              series: "1",
              supplier: "Fornecedor",
              issuedAt: "2026-10-20",
              total: 20,
            },
          ]
        : kind === "catalog"
          ? [{ id: 300, category: "Farinhas" }]
          : [
              {
                id: 1,
                invoiceId: 1,
                itemId: 300,
                name: "Farinha",
                unit: "KG",
                quantity: 3,
                unitPrice: 20,
                total: 20,
              },
            ];
    return r.fulfill({ json: { records, totalPages: 1, page: 1 } });
  });
  await page.route("**/api/everest?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    expect(params.get("unit")).toBe("1");
    expect(params.get("id")).toBe("1");
    expect(params.get("snapshot")).toBe("snapshot-test");
    return r.fulfill({
      json: {
        record: {
          id: 1,
          name: "Ficha do prato teste",
          quantity: 10,
          unit: "UNID",
          version: 2,
          instructions: "Misture e asse.",
          notes: "Servir quente.",
          components: [
            { itemId: 300, name: "Farinha na ficha", quantity: 5, unit: "KG" },
          ],
        },
      },
    });
  });
  let saved = false;
  let multiplePriorities = false;
  await page.route("**/api/stock-context**", (r) => {
    if (r.request().method() === "POST") {
      expect(r.request().postDataJSON()).toEqual({
        unitId: 1,
        saleName: "Outro prato",
        recipeId: 1,
        outputPerSale: 1,
      });
      saved = true;
      return r.fulfill({ json: { saved: true } });
    }
    const unit = Number(new URL(r.request().url()).searchParams.get("unit"));
    return r.fulfill({
      json: {
        unit: { id: unit, name: unit === 1 ? "Meet" : "Madonna" },
        start: "2026-10-20",
        end: "2026-10-23",
        lastDate: "2026-10-22",
        syncedAt: null,
        snapshotId: "snapshot-test",
        canEdit: true,
        daily: [{ date: "2026-10-20", workdays: 1, products: 2, quantity: 6 }],
        issues: ["2026-10-23: sem movimento importado"],
        pending: saved
          ? []
          : [
              {
                name: "Outro prato",
                quantity: 2,
                reason: "Sem vínculo",
                recipeId: null,
                outputPerSale: null,
              },
            ],
        dishes: [
          {
            id: "p",
            recipeId: 1,
            name: "Prato teste",
            recipeName: "Prato teste",
            principal: {
              itemId: 300,
              name: "Farinha",
              unit: "KG",
              appliedCost: 20,
              preparation: false,
            },
            priorities: multiplePriorities
              ? [
                  {
                    itemId: 300,
                    name: "Ojo de Bife",
                    unit: "KG",
                    appliedCost: null,
                    preparation: false,
                  },
                  {
                    itemId: 301,
                    name: "Picanha",
                    unit: "KG",
                    appliedCost: null,
                    preparation: false,
                  },
                  {
                    itemId: 302,
                    name: "Chorizo",
                    unit: "KG",
                    appliedCost: null,
                    preparation: false,
                  },
                ]
              : [],
            sold: saved ? 6 : 4,
            outputPerSale: 1,
            outputUnit: "UNID",
            reason: null,
            requirements: [
              { itemId: 300, name: "Farinha", unit: "KG", quantity: 0.5 },
            ],
          },
        ],
        options: [{ id: 1, name: "Prato teste", unit: "UNID", yield: 1 }],
        sales: [
          {
            name: "Outro prato",
            quantity: 2,
            netValue: unit === 1 ? 200 : 5,
            groups: ["Massas Frescas"],
          },
          {
            name: "Prato teste",
            quantity: 4,
            netValue: 100,
            groups: ["Proteinas"],
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  const control = page.locator(".stock-control");
  await expect(
    control.getByText("2 (estimadas)", { exact: true }),
  ).toBeVisible();
  await control.getByRole("tab", { name: "Cardápio por restaurante" }).click();
  await page.getByLabel("Categoria do cardápio").selectOption("Massas");
  await expect(
    control.getByRole("button", { name: "Abrir ficha de Prato teste" }),
  ).toHaveCount(0);
  await expect(control.getByText("Outro prato", { exact: true })).toBeVisible();
  await page.getByLabel("Categoria do cardápio").selectOption("Proteínas");
  await expect(control.getByText("Outro prato", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    control.getByText("2 porções estimadas", { exact: true }),
  ).toBeVisible();
  await control.getByRole("tab", { name: "Top 20 produtos" }).click();
  const quantityRanking = control.getByRole("region", {
    name: "Ranking por quantidade",
  });
  const valueRanking = control.getByRole("region", {
    name: "Ranking por valor",
  });
  await expect(quantityRanking.locator("tbody tr").first()).toContainText(
    "Prato teste",
  );
  await expect(valueRanking.locator("tbody tr").first()).toContainText(
    "Outro prato",
  );
  await expect(
    valueRanking.locator("tbody tr").first().locator("td").first(),
  ).toHaveText("1");
  await expect(quantityRanking.locator("tbody tr").first()).toContainText(
    "Farinha",
  );
  await expect(quantityRanking.locator("tbody tr").first()).toContainText(
    "1 KG (estimado)",
  );
  await control.getByRole("button", { name: "Limpar seleção" }).click();
  await expect(quantityRanking.locator("tbody tr")).toHaveCount(0);
  await control
    .getByRole("checkbox", { name: "Entradas", exact: true })
    .check();
  await expect(quantityRanking.locator("tbody tr")).toHaveCount(0);
  await control
    .getByRole("checkbox", { name: "Pratos principais", exact: true })
    .check();
  await expect(quantityRanking.locator("tbody tr")).toHaveCount(2);
  await control
    .getByRole("checkbox", { name: "Pratos principais", exact: true })
    .uncheck();
  await expect(valueRanking.locator("tbody tr")).toHaveCount(0);
  await control.getByRole("button", { name: "Selecionar todas" }).click();
  await page.getByLabel("Restaurante do estoque").selectOption("3");
  await expect(valueRanking.locator("tbody tr").first()).toContainText(
    "Prato teste",
  );
  await expect(valueRanking.locator("tbody tr").first()).toContainText(
    "0 KG (estimado)",
  );
  multiplePriorities = true;
  await page.getByLabel("Restaurante do estoque").selectOption("1");
  const priorities = quantityRanking.locator("tbody tr").first();
  await expect(priorities).toContainText("Ojo de Bife");
  await expect(priorities).toContainText("1 KG (estimado)");
  await expect(priorities).toContainText("Picanha");
  await expect(priorities).toContainText("Chorizo");
  await expect(
    priorities.getByText("0 KG (estimado)", { exact: true }),
  ).toHaveCount(2);
  await expect(priorities).not.toContainText("a conferir");
  multiplePriorities = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(valueRanking).toBeVisible();
  await page.screenshot({
    path: "/tmp/stock-ranking-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Restaurante do estoque").selectOption("1");
  await control.getByRole("tab", { name: "Cardápio por restaurante" }).click();
  const toggle = control.getByRole("button", {
    name: "Abrir ficha de Prato teste",
  });
  await toggle.click();
  await expect(
    control.getByRole("button", { name: "Fechar ficha de Prato teste" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    control.getByText("Ficha do prato teste", { exact: true }),
  ).toBeVisible();
  await expect(
    control.getByText("Misture e asse.", { exact: true }),
  ).toBeVisible();
  const ingredient = control
    .locator(".stock-menu-balance")
    .getByRole("row")
    .filter({ hasText: "Farinha" });
  await expect(ingredient).toContainText("0,5 KG");
  await expect(ingredient).toContainText("1 KG");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    control.getByText("Ficha do prato teste", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/stock-menu-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "/tmp/stock-menu-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Restaurante do estoque").selectOption("3");
  await expect(
    control.getByRole("heading", { name: "Cardápio · Madonna" }),
  ).toBeVisible();
  await expect(
    control.getByText("Ficha do prato teste", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Restaurante do estoque").selectOption("1");
  await expect(
    control.getByRole("heading", { name: "Cardápio · Meet" }),
  ).toBeVisible();
  await control.getByRole("tab", { name: "Saldo por categoria" }).click();
  const row = control.getByRole("row").filter({ hasText: "Farinha" });
  await expect(row).toContainText("3 KG");
  await expect(row).toContainText("2 KG");
  await expect(row).toContainText("1 KG");
  await page.getByLabel("Restaurante do estoque").selectOption("3");
  await expect(row).toContainText("-2 KG");
  await page.getByLabel("Restaurante do estoque").selectOption("1");
  await control.getByRole("tab", { name: "Vendas e vínculos" }).click();
  await control
    .getByRole("row")
    .filter({ hasText: "Outro prato" })
    .getByRole("button", { name: "Conferir vínculo" })
    .click();
  await page.getByLabel("Ficha para consumo").selectOption("1");
  await page.getByLabel("Quantidade por venda").fill("1");
  await page
    .getByRole("button", { name: "Confirmar vínculo e recalcular" })
    .click();
  await expect(control.getByText("Sem vínculo", { exact: true })).toHaveCount(
    0,
  );
  await control
    .getByRole("tab", { name: "Disponibilidade dos pratos" })
    .click();
  await expect(control.getByText("Sem saldo", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    control.getByRole("heading", { name: "Controle de estoque" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/stock-control-mobile.png",
    fullPage: true,
  });
});
