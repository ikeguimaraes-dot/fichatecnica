import { test, expect } from "@playwright/test";
test("biblioteca: busca, categorias, favoritos e custos", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Sobremesas", exact: true }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Todas as receitas", exact: true })
    .click();
  await page.getByLabel("Buscar receitas").fill("salmão");
  await expect(page.locator(".recipe-card")).toHaveCount(1);
  await page.getByLabel("Buscar receitas").fill("inexistente");
  await expect(
    page.getByText("Ainda não encontramos essa receita."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar busca", exact: true })
    .last()
    .click();
  await page.getByLabel("Favoritar Salada da horta").click();
  await page.getByRole("button", { name: /Favoritas/ }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(2);
});
test("criação, cálculo g/kg, foto, edição, persistência e exclusão", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await page.getByRole("button", { name: "Nova receita", exact: true }).click();
  await page.getByLabel("Nome do prato").fill("Receita de teste");
  await page.getByLabel("Rendimento final (kg)").fill("2");
  await page.getByLabel("Adicionar foto principal").setInputFiles({
    name: "prato.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRz8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Ingrediente 1", { exact: true }).fill("Farinha");
  await page.getByLabel("Quantidade 1", { exact: true }).fill("250");
  await page.getByLabel("Preço por kg 1", { exact: true }).fill("40");
  await expect(page.getByTestId("editor-total")).toHaveText("R$ 10,00");
  await page.getByRole("button", { name: "Adicionar ingrediente" }).click();
  await page.getByLabel("Ingrediente 2", { exact: true }).fill("Manteiga");
  await page.getByLabel("Quantidade 2", { exact: true }).fill("0.5");
  await page.getByLabel("Unidade 2", { exact: true }).selectOption("kg");
  await page.getByLabel("Preço por kg 2", { exact: true }).fill("20");
  await expect(page.getByTestId("editor-total")).toHaveText("R$ 20,00");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page
    .getByLabel("Etapa 1", { exact: true })
    .fill("Misture os ingredientes e asse.");
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await page
    .getByRole("button", { name: "Receita de teste", exact: true })
    .click();
  await expect(page.locator(".detail-summary")).toContainText("R$ 20,00");
  await expect(page.locator(".detail-summary")).toContainText("R$ 10,00");
  await page.getByRole("button", { name: "Editar receita" }).click();
  await page.getByLabel("Nome do prato").fill("Receita revisada");
  await page.getByRole("button", { name: "03Modo de preparo" }).click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await page
    .getByRole("button", { name: "Receita revisada", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Excluir receita", { exact: true }).click();
  await expect(page.locator(".recipe-card")).toHaveCount(6);
});
test("responsividade e captura desktop/celular", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(6);
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Nova receita", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-editor.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
