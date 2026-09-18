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
  await page.getByLabel("Unidade 1", { exact: true }).selectOption("ml");
  await page.getByLabel("Quantidade 1", { exact: true }).fill("500");
  await expect(
    page.getByLabel("Preço por litro 1", { exact: true }),
  ).toHaveValue("30");
  await expect(page.getByTestId("editor-total")).toContainText("15,00");
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
  expect(rows[0].content.ingredients[0].unit).toBe("ml");
  expect(uploaded).toContain("receita-compartilhada-fotos/" + owner);
  await page
    .getByRole("button", { name: "Ver receita Linguiça da casa" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("R$ 15,00");
  await page.getByRole("tab", { name: "Modo de preparo", exact: true }).click();
  await page.getByRole("button", { name: "Ampliar prato final" }).click();
  await expect(page.getByAltText("Foto do preparo ampliada")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Ficha técnica", exact: true }).click();
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

test("ficha abre com preços e aba Modo de preparo mostra composição e preparo sem valores", async ({
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
  await dialog
    .getByRole("tab", { name: "Modo de preparo", exact: true })
    .click();
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
  await dialog
    .getByRole("tab", { name: "Modo de preparo", exact: true })
    .click();
  await page.getByLabel("Fechar janela").click();
  await page.getByRole("button", { name: "Ver receita Lord" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("R$ 30,00");
});

test("preparo compartilhado usa editor das unidades, preserva custos e imprime preparo em uma A4 horizontal sem preços", async ({
  page,
}) => {
  await login(page);
  let row: any = {
    ...sample,
    book_slug: "linguica",
    content: { ...sample.content, title: "Lord" },
  };
  await page.route("**/rest/v1/receita_compartilhada?**", (r) => {
    if (r.request().method() === "PATCH") {
      row = { ...row, ...r.request().postDataJSON() };
      return r.fulfill({ json: [{ id: row.id }] });
    }
    return r.fulfill({ json: [row] });
  });
  await page.route("**/storage/v1/object/receita-compartilhada-fotos/**", (r) =>
    r.fulfill({ json: { Key: "uploaded" } }),
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
  await page.getByRole("button", { name: "Ver receita Lord" }).click();
  await page.getByRole("tab", { name: "Modo de preparo", exact: true }).click();
  await expect(page.locator(".prep-panel")).toContainText("Misture e modele.");
  await page.getByRole("button", { name: "Editar preparo" }).click();
  await page.getByLabel("Título da etapa 1").fill("Misturar");
  await page
    .getByRole("button", { name: "Adicionar etapa", exact: true })
    .click();
  await page
    .getByLabel("Instruções da etapa 2")
    .fill("Resfrie antes de servir.");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 20;
    c.getContext("2d")!.fillRect(0, 0, 20, 20);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Foto da etapa 2", { exact: true }).setInputFiles({
    name: "foto.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Ampliar foto 1 da etapa 2" }),
  ).toBeVisible();
  await page.getByLabel("Subir etapa 2").click();
  await page.getByRole("button", { name: "Salvar preparo" }).click();
  await expect(page.getByText("Modo de preparo salvo.")).toBeVisible();
  expect(row.content.steps[0].photos).toHaveLength(1);
  expect(row.content.ingredients).toEqual(sample.content.ingredients);
  expect(row.content.steps[0].text).toBe("Resfrie antes de servir.");
  expect(row.content.steps[1].title).toBe("Misturar");
  await page.getByRole("button", { name: "Prévia A4" }).click();
  const preview = page.getByRole("dialog", { name: "Prévia de impressão A4" });
  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeEnabled();
  await expect(page.locator(".prep-paper")).not.toContainText("R$");
  await expect(page.locator(".prep-paper")).toContainText(
    "Resfrie antes de servir.",
  );
  const pdf = await page.pdf({
    path: "test-results/shared-standard-a4.pdf",
    preferCSSPageSize: true,
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
  await page.screenshot({
    path: "test-results/shared-standard-a4.png",
    fullPage: true,
    animations: "disabled",
  });
  await preview.getByRole("button", { name: "Voltar à ficha" }).click();
  await page.getByLabel("Fechar janela").click();
  await page.getByRole("button", { name: "Ver receita Lord" }).click();
  await page.getByRole("tab", { name: "Modo de preparo", exact: true }).click();
  await expect(page.locator(".prep-steps")).toContainText(
    "Resfrie antes de servir.",
  );
});

test("diagramação de referência mantém 13 ingredientes e seis etapas com fotos em uma A4", async ({
  page,
}) => {
  await login(page, other);
  const ingredientNames = [
    "Copa Lombo",
    "Toucinho",
    "Queijo em cubos",
    "Água gelada",
    "Sal",
    "Açúcar Mascavo",
    "Páprica",
    "Cebola em pó",
    "Alho fresco",
    "Pimenta Preta Moída",
    "Ervas Secas",
    "Sal de cura (Tipo 1)",
    "Antioxidante",
  ];
  const instructions = [
    "Controle de temperatura: mantenha os ingredientes resfriados durante o processo de moagem para garantir boa emulsão e evitar a separação da gordura.",
    "Mistura e extração de liga: misture as carnes com o sal, os temperos e a água gelada até obter a extração das proteínas e uma massa firme.",
    "Descanso da massa: guarde a massa bem coberta na geladeira. Esta etapa permite a distribuição dos temperos e a maturação da liga.",
    "Adição do queijo: retire a massa da geladeira e adicione o queijo em cubos bem gelado, misturando apenas o suficiente para distribuir de forma homogênea.",
    "Ensague a massa com o queijo em tripa natural, garantindo que não fiquem bolhas de ar.",
    "Hidrate a tripa antes de começar o preparo.",
  ];
  await page.route("**/rest/v1/receita_compartilhada?**", (r) =>
    r.fulfill({
      json: [
        {
          ...sample,
          book_slug: "linguica",
          content: {
            ...sample.content,
            title: "Linguiça Lord",
            cover: "final.png",
            yield_kg: 10,
            ingredients: ingredientNames.map((name, i) => ({
              id: String(i),
              name,
              quantity: i < 4 ? 2 : 45,
              unit: i < 4 ? "kg" : "g",
              price: 30,
            })),
            steps: instructions.map((text, i) => ({
              id: String(i),
              text,
              photo: `step-${i}.png`,
            })),
          },
        },
      ],
    }),
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
            signedURL: `/object/sign/receita-compartilhada-fotos/${path}?token=test`,
          })),
      }),
  );
  await page.route(
    "**/storage/v1/object/sign/receita-compartilhada-fotos/**",
    (r) =>
      r.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#e6b990"/><circle cx="40" cy="50" r="25" fill="#ae6945"/></svg>',
      }),
  );
  await menu(page);
  await page.getByRole("button", { name: "Abrir livro Linguiça" }).click();
  await page.getByRole("button", { name: "Ver receita Linguiça Lord" }).click();
  await page.getByRole("tab", { name: "Modo de preparo", exact: true }).click();
  await page.getByRole("button", { name: "Prévia A4" }).click();
  const preview = page.getByRole("dialog", { name: "Prévia de impressão A4" });
  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeEnabled();
  const paper = page.locator(".prep-paper");
  await expect(paper.locator("tbody tr")).toHaveCount(13);
  await expect(paper.locator("li img")).toHaveCount(6);
  await expect(paper).not.toContainText("R$");
  const header = await paper.locator("header").boundingBox();
  const method = await paper.locator(".prep-paper-method").boundingBox();
  expect(Math.abs(header!.y - method!.y)).toBeLessThan(1);
  expect(method!.x).toBeGreaterThan(header!.x + header!.width);
  const pdf = await page.pdf({
    path: "test-results/reference-layout.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    1,
  );
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await paper.screenshot({ path: "test-results/reference-layout.png" });
  await preview.getByRole("button", { name: "Voltar à ficha" }).click();
  await page.getByRole("tab", { name: "Impressão", exact: true }).click();
  await page.getByRole("button", { name: "Prévia A4" }).click();
  const illustrated = preview.locator(".illustrated-paper");

  await expect(
    preview.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeEnabled();
  await expect(illustrated.locator(".illustrated-ingredient")).toHaveCount(13);
  await expect(illustrated.locator(".illustrated-step-grid > li")).toHaveCount(
    6,
  );
  await expect(illustrated.locator("img")).toHaveCount(7);
  await expect(illustrated).not.toContainText("R$");
  const layout = await illustrated.evaluate((el) => {
    const sheet = el.getBoundingClientRect();
    const footer = el.querySelector("footer")!.getBoundingClientRect();
    const photo = el
      .querySelector(".illustrated-step-photos img")!
      .getBoundingClientRect();
    return {
      bottomGap: sheet.bottom - footer.bottom,
      photoHeight: photo.height,
      fontSize: parseFloat(
        getComputedStyle(el.querySelector(".illustrated-step-grid p")!)
          .fontSize,
      ),
    };
  });
  expect(layout.fontSize).toBeGreaterThanOrEqual(11);
  expect(layout.photoHeight).toBeGreaterThanOrEqual(98);
  expect(layout.bottomGap).toBeGreaterThanOrEqual(14);
  expect(layout.bottomGap).toBeLessThan(18);

  for (const text of instructions)
    await expect(illustrated).toContainText(text);
  const illustratedPdf = await page.pdf({
    path: "test-results/illustrated-a4.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(
    (illustratedPdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
  ).toBe(1);
  await page.emulateMedia({ media: "screen" });
  await illustrated.screenshot({
    path: "test-results/illustrated-a4.png",
    animations: "disabled",
  });
});

test("aba Impressão exibe a folha e imprime uma única página", async ({
  page,
}) => {
  await login(page, other);
  await page.route("**/rest/v1/receita_compartilhada?**", (r) =>
    r.fulfill({ json: [sample] }),
  );
  await menu(page);
  await page.getByRole("button", { name: "Abrir livro Hamburguer" }).click();
  await page.getByRole("button", { name: "Ver receita Blend da casa" }).click();
  await page.getByRole("tab", { name: "Modo de preparo", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Impressão", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "Impressão" });
  await expect(
    panel.getByRole("button", { name: "Imprimir ficha completa" }),
  ).toBeEnabled();
  await expect(panel).toContainText("Misture e modele.");
  await expect(panel).not.toContainText("R$");
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length).toBe(
    1,
  );
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("tab", { name: "Impressão", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/printing-tab-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
