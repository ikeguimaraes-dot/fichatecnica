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
  let saved = false;
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
        sales: [{ name: "Outro prato", quantity: 2 }],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  const control = page.locator(".stock-control");
  await expect(
    control.getByText("2 (estimadas)", { exact: true }),
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
  await control.getByRole("button", { name: "Conferir vínculo" }).click();
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
