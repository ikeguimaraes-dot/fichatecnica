import { test, expect } from "@playwright/test";
test("Estoque loads every page and groups NF items by Everest category", async ({
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
  const visited: string[] = [];
  await page.route("**/api/everest-stock?**", (r) => {
    const params = new URL(r.request().url()).searchParams;
    const kind = params.get("kind"),
      number = Number(params.get("page"));
    visited.push(`${kind}:${number}`);
    expect(params.get("start")).toBe("2026-10-20");
    const records =
      kind === "invoices"
        ? [
            {
              id: number,
              unitId: 1,
              unitName: "Cozinha",
              number: String(100 + number),
              series: "1",
              supplier: "Fornecedor",
              issuedAt: "2026-10-20T12:00:00",
              total: 20,
              status: 1,
            },
          ]
        : kind === "catalog"
          ? [
              { id: 1, category: "Hortifruti" },
              { id: 2, category: "Laticínios" },
            ]
          : [
              {
                id: 1,
                invoiceId: 1,
                itemId: 1,
                code: "01",
                name: "Tomate",
                quantity: 2,
                unit: "KG",
                unitPrice: 10,
                total: 20,
              },
              {
                id: 2,
                invoiceId: 2,
                itemId: 2,
                code: "02",
                name: "Queijo",
                quantity: 1,
                unit: "KG",
                unitPrice: 20,
                total: 20,
              },
            ];
    return r.fulfill({
      json: { records, page: number, totalPages: kind === "invoices" ? 2 : 1 },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Estoque", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hortifruti", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Laticínios", exact: true }),
  ).toBeVisible();
  expect(visited).toContain("invoices:2");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Hortifruti");
  await expect(page.getByText("Tomate", { exact: true })).toBeVisible();
  await expect(page.getByText("Queijo", { exact: true })).toHaveCount(0);
  await page.route("**/api/everest-stock?**", (r) =>
    r.fulfill({ status: 502, json: { error: "Falha de consulta" } }),
  );
  await page.getByRole("button", { name: "Consultar entradas" }).click();
  await expect(page.getByRole("alert")).toContainText("Falha de consulta");
  await expect(
    page.getByText("Nenhuma nota de entrada no período"),
  ).toHaveCount(0);
});
