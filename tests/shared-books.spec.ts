import { test, expect, type Page } from "@playwright/test";
const owner = "7ec10346-2f07-4ec7-93d0-3b1d1ee307ed",
  other = "aaaaaaaa-2222-4222-8222-222222222222";
async function login(page: Page, id = owner) {
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "sb-iqgrvptrtphvbmvrqntm-auth-token",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id,
            email: "test@example.com",
            aud: "authenticated",
            role: "authenticated",
          },
        }),
      ),
    { id },
  );
  await page.route("**/auth/v1/user", (r) =>
    r.fulfill({ json: { id, email: "test@example.com" } }),
  );
  await page.route("**/rest/v1/**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/everest?**", (r) =>
    r.fulfill({
      status: 403,
      json: { error: "Sua conta não tem acesso às fichas do Everest." },
    }),
  );
}
async function menu(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Ficha técnica", exact: true })
    .click();
}
const sample = {
  id: "11111111-1111-4111-8111-111111111111",
  book_slug: "hamburguer",
  revision: "r1",
  updated_at: "2026-09-17",
  content: {
    title: "Blend da casa",
    description: "Receita da equipe",
    category: "Principais",
    yield_kg: 1,
    minutes: 20,
    cover: "",
    ingredients: [
      { id: "i", name: "Carne", quantity: 1, unit: "kg", price: 30 },
    ],
    steps: [{ id: "s", text: "Misture e modele.", photo: "" }],
    notes: "Manter refrigerado",
    favorite: false,
  },
};
test("usuário sem acesso Everest consulta os dois livros e não vê ações de edição", async ({
  page,
}) => {
  await login(page, other);
  await page.route("**/rest/v1/receita_compartilhada?**", (r) =>
    r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get("book_slug") ===
        "eq.hamburguer"
          ? [sample]
          : [],
    }),
  );
  await menu(page);
  await expect(
    page.getByRole("button", { name: "Abrir livro Linguiça" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir livro Hamburguer" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/shared-shelf.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Abrir livro Hamburguer" }).click();
  await expect(
    page
      .locator(".shared-book")
      .getByRole("button", { name: "Nova receita", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver receita Blend da casa" }).click();
  await expect(page.getByRole("dialog")).toContainText("R$ 30,00");
  await expect(
    page.getByRole("button", { name: "Editar receita" }),
  ).toHaveCount(0);
  await page.getByLabel("Fechar janela").click();
  await page
    .getByRole("button", { name: "Todos os livros de ficha técnica" })
    .click();
  await page.getByRole("button", { name: "Abrir livro Linguiça" }).click();
  await expect(
    page.getByRole("button", { name: "Ver receita Blend da casa" }),
  ).toHaveCount(0);
});
test("autor cria receita com custo, foto, edita e exclui no livro compartilhado", async ({
  page,
}) => {
  await login(page);
  let rows: any[] = [];
  let uploaded = "";
  await page.route("**/rest/v1/receita_compartilhada?**", (r) => {
    const method = r.request().method();
    if (method === "POST") rows = [r.request().postDataJSON()];
    if (method === "PATCH") rows = [r.request().postDataJSON()];
    if (method === "DELETE") rows = [];
    return r.fulfill({ json: method === "GET" ? rows : [{ id: "saved" }] });
  });
  await page.route(
    "**/storage/v1/object/receita-compartilhada-fotos/**",
    (r) => {
      uploaded = r.request().url();
      return r.fulfill({ json: { Key: "uploaded" } });
    },
  );
  await page.route(
    "**/storage/v1/object/sign/receita-compartilhada-fotos",
    (r) =>
      r.fulfill({
        json: r
          .request()
          .postDataJSON()
          .paths.map((path: string) => ({
            path,
            signedURL:
              "/object/sign/receita-compartilhada-fotos/" +
              path +
              "?token=test",
          })),
      }),
  );
  await page.route(
    "**/storage/v1/object/sign/receita-compartilhada-fotos/**",
    (r) =>
      r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
  );
  await menu(page);
  await page.getByRole("button", { name: "Abrir livro Linguiça" }).click();
  await page
    .locator(".shared-book")
    .getByRole("button", { name: "Nova receita", exact: true })
    .click();
  await page.getByLabel("Nome do prato").fill("Linguiça da casa");
  await page.getByLabel("Rendimento final (kg)").fill("2");
  await expect(page.getByLabel("Livro de receitas")).toBeDisabled();
  await page.getByLabel("Adicionar foto principal").setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Ingrediente 1", { exact: true }).fill("Carne");
  await page.getByLabel("Quantidade 1", { exact: true }).fill("2");
  await page.getByLabel("Unidade 1", { exact: true }).selectOption("kg");
  await page.getByLabel("Preço por kg 1", { exact: true }).fill("30");
  await expect(page.getByTestId("editor-total")).toContainText("60,00");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByLabel("Etapa 1", { exact: true })
    .fill("Misture os temperos.");
  await page
    .getByRole("button", { name: "Salvar receita", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ver receita Linguiça da casa" }),
  ).toBeVisible();
  expect(rows[0].book_slug).toBe("linguica");
  expect(uploaded).toContain("receita-compartilhada-fotos/" + owner);
  await page
    .getByRole("button", { name: "Ver receita Linguiça da casa" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("R$ 60,00");
  await page.getByRole("button", { name: "Ampliar foto do prato" }).click();
  await expect(page.getByAltText("Foto ampliada")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Editar receita" }).click();
  await page.getByLabel("Nome do prato").fill("Linguiça revisada");
  await page.getByRole("button", { name: "03Modo de preparo" }).click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await page
    .getByRole("button", { name: "Ver receita Linguiça revisada" })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Excluir receita" }).click();
  await expect(
    page.getByRole("button", { name: "Ver receita Linguiça revisada" }),
  ).toHaveCount(0);
});
test("livro compartilhado tem layout móvel sem transbordamento", async ({
  page,
}) => {
  await login(page);
  await page.route("**/rest/v1/receita_compartilhada?**", (r) =>
    r.fulfill({ json: [sample] }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await menu(page);
  await page.getByRole("button", { name: "Abrir livro Hamburguer" }).click();
  await page.getByRole("button", { name: "Ver receita Blend da casa" }).click();
  await page.screenshot({
    path: "test-results/shared-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("ficha abre com preços e aba Receita mostra composição e preparo sem valores", async ({
  page,
}) => {
  await login(page, other);
  await page.route("**/rest/v1/receita_compartilhada?**", (r) =>
    r.fulfill({
      json: [
        {
          ...sample,
          book_slug: "linguica",
          content: { ...sample.content, title: "Lord" },
        },
      ],
    }),
  );
  await menu(page);
  await page.getByRole("button", { name: "Abrir livro Linguiça" }).click();
  await page.getByRole("button", { name: "Ver receita Lord" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("tab", { name: "Ficha técnica", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tabpanel")).toContainText("R$ 30,00");
  await dialog.getByRole("tab", { name: "Receita", exact: true }).click();
  await expect(dialog.getByRole("tabpanel")).not.toContainText("R$");
  await expect(
    dialog.getByRole("columnheader", { name: "Preço / kg" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("columnheader", { name: "Custo", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("tabpanel")).toContainText("Carne");
  await expect(dialog.getByRole("tabpanel")).toContainText("1 kg");
  await expect(dialog.getByRole("tabpanel")).toContainText("Misture e modele.");
  await expect(dialog.getByRole("tabpanel")).toContainText(
    "Manter refrigerado",
  );
  await page.screenshot({
    path: "test-results/shared-recipe-tab.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("tabpanel")).toContainText("R$ 30,00");
  await dialog.getByRole("tab", { name: "Receita", exact: true }).click();
  await page.getByLabel("Fechar janela").click();
  await page.getByRole("button", { name: "Ver receita Lord" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("R$ 30,00");
});
