import { test, expect } from "@playwright/test";
test("estante, busca e conteúdo independente por livro", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".book-jacket")).toHaveCount(4);
  await page.getByLabel("Buscar livros").fill("francesa");
  await expect(page.locator(".book-jacket")).toHaveCount(1);
  await page.getByLabel("Buscar livros").fill("");
  await page
    .getByRole("button", { name: "Abrir livro Massas", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Massas");
  await page.getByRole("button", { name: "Voltar aos livros" }).click();
  await page
    .getByRole("button", { name: "Abrir livro Cozinha francesa" })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Criar minha primeira receita" }),
  ).toBeVisible();
});
test("criar, mover receitas, editar livro e excluir sem perder receitas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Novo livro", exact: true }).click();
  await page.getByLabel("Nome do livro").fill("Receitas de família");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("As histórias da nossa mesa.");
  await page.getByRole("button", { name: "Grafite", exact: false }).click();
  await page.getByRole("button", { name: "Criar livro", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Receitas de família",
  );
  await page
    .getByRole("button", { name: "Adicionar receitas existentes" })
    .click();
  await page.getByRole("checkbox", { name: /Fusilli/ }).check();
  await page.getByRole("checkbox", { name: /Chocolate/ }).check();
  await page.getByRole("button", { name: "Mover 2 receitas" }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.reload();
  await page
    .getByRole("button", { name: "Abrir livro Receitas de família" })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Editar livro", exact: true }).click();
  await page.getByLabel("Nome do livro").fill("Caderno da família");
  await page.getByRole("button", { name: "Salvar livro", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Caderno da família",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Excluir livro", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir livro Caderno da família" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Sem livro Receitas esperando/ })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(3);
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(6);
});
test("nova receita pertence ao livro aberto e pode ser movida no editor", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Abrir livro Cozinha francesa" })
    .click();
  await page.getByRole("button", { name: "Nova receita", exact: true }).click();
  await expect(
    page.getByLabel("Livro de receitas", { exact: true }),
  ).toHaveValue("book-french");
  await page.getByLabel("Nome do prato").fill("Crêpe");
  await page.getByLabel("Rendimento final (kg)").fill("0.5");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Ingrediente 1", { exact: true }).fill("Farinha");
  await page.getByLabel("Quantidade 1", { exact: true }).fill("100");
  await page.getByLabel("Preço por kg 1", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Etapa 1", { exact: true }).fill("Misture e cozinhe.");
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Crêpe", exact: true }).click();
  await page.getByRole("button", { name: "Editar receita" }).click();
  await page
    .getByLabel("Livro de receitas", { exact: true })
    .selectOption("book-pasta");
  await page.getByRole("button", { name: "03Modo de preparo" }).click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar aos livros" }).click();
  await page
    .getByRole("button", { name: "Abrir livro Massas", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(4);
});
test("fotos de capa e layout da estante no desktop e celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(page.locator(".book-jacket")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/books-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/books-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Novo livro", exact: true }).click();
  await page.getByLabel("Nome do livro").fill("Fotos");
  await page.getByLabel("Foto de capa do livro").setInputFiles({
    name: "capa.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRz8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("Capa do livro")).toBeVisible();
  await page.screenshot({
    path: "test-results/book-editor-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Criar livro", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Abrir livro Fotos" }).click();
  await page.getByRole("button", { name: "Editar livro", exact: true }).click();
  await expect(page.getByAltText("Capa do livro")).toBeVisible();
});
test("receitas antigas continuam acessíveis em Sem livro", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "mise-demo-v1",
      JSON.stringify([
        {
          id: "legacy",
          title: "Receita antiga",
          category: "Principais",
          description: "",
          cover: "",
          minutes: 10,
          servings: 1,
          ingredients: [],
          steps: [],
          notes: "",
          favorite: false,
          updated_at: "2026-09-15T12:00:00Z",
        },
      ]),
    );
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Sem livro Receitas esperando/ })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Receita antiga", exact: true }),
  ).toBeVisible();
});
