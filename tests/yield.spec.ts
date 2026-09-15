import { test, expect } from "@playwright/test";
const legacy = {
  id: "legacy-yield",
  title: "Massa de teste",
  category: "Principais",
  description: "",
  cover: "",
  minutes: 10,
  servings: 2,
  ingredients: [
    { id: "i", name: "Farinha", quantity: 500, unit: "g", price: 40 },
  ],
  steps: [{ id: "s", text: "Misture.", photo: "" }],
  notes: "",
  favorite: false,
  updated_at: "2026-09-15T12:00:00Z",
};
test("rendimento legado não vira kg; decimais abaixo e acima de 1 calculam corretamente", async ({
  page,
}) => {
  await page.addInitScript((r) => {
    if (!localStorage.getItem("mise-demo-v1"))
      localStorage.setItem("mise-demo-v1", JSON.stringify([r]));
  }, legacy);
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await expect(page.locator(".card-footer")).toContainText("A informar");
  await expect(page.locator(".card-meta")).toContainText(
    "Rendimento a informar",
  );
  await page
    .getByRole("button", { name: "Massa de teste", exact: true })
    .click();
  await expect(page.locator(".detail-summary")).toContainText("R$ 20,00");
  await expect(page.locator(".detail-summary")).toContainText("A informar");
  await page.getByRole("button", { name: "Editar receita" }).click();
  await expect(page.getByLabel("Rendimento final (kg)")).toHaveValue("");
  await page.getByLabel("Rendimento final (kg)").fill("0.5");
  await expect(page.locator(".editor-footer")).toContainText("R$ 40,00 / kg");
  await page.getByRole("button", { name: "03Modo de preparo" }).click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.locator(".card-meta")).toContainText("0,5 kg");
  await expect(page.locator(".card-footer")).toContainText("R$ 40,00");
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await expect(page.locator(".card-meta")).toContainText("0,5 kg");
  await page
    .getByRole("button", { name: "Massa de teste", exact: true })
    .click();
  await page.getByRole("button", { name: "Editar receita" }).click();
  await page.getByLabel("Rendimento final (kg)").fill("2.5");
  await expect(page.locator(".editor-footer")).toContainText("R$ 8,00 / kg");
  await page.getByRole("button", { name: "03Modo de preparo" }).click();
  await page.getByRole("button", { name: "Salvar receita" }).click();
  await expect(page.locator(".card-meta")).toContainText("2,5 kg");
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("mise-demo-v1")!)[0],
  );
  expect(saved.yield_kg).toBe(2.5);
  expect(saved.servings).toBeUndefined();
});
test("rendimento zero ou vazio impede salvar e não mostra infinito", async ({
  page,
}) => {
  await page.addInitScript(
    (r) => localStorage.setItem("mise-demo-v1", JSON.stringify([r])),
    legacy,
  );
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: /Todas as receitas/ })
    .click();
  await page
    .getByRole("button", { name: "Massa de teste", exact: true })
    .click();
  await page.getByRole("button", { name: "Editar receita" }).click();
  for (const value of ["0", ""]) {
    await page.getByLabel("Rendimento final (kg)").fill(value);
    await expect(page.locator(".editor-footer")).toContainText(
      "Informe o rendimento em kg",
    );
    await expect(page.locator(".editor-footer")).not.toContainText("Infinity");
    await page.getByRole("button", { name: "03Modo de preparo" }).click();
    await page.getByRole("button", { name: "Salvar receita" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Informe o rendimento final em kg",
    );
    await expect(page.getByRole("dialog")).toBeVisible();
  }
});
