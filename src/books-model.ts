export type RecipeBook = {
  id: string;
  title: string;
  description: string;
  cover: string;
  theme: "orange" | "cream" | "ink";
  updated_at: string;
  user_id?: string;
};
export const emptyBook = (): RecipeBook => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  cover: "",
  theme: "orange",
  updated_at: new Date().toISOString(),
});
export const demoBooks: RecipeBook[] = [
  {
    id: "book-pasta",
    title: "Massas",
    description:
      "Farinha, tempo e afeto. Receitas para enrolar, rechear e compartilhar.",
    cover: "",
    theme: "orange",
    updated_at: "2026-09-15T12:00:00Z",
  },
  {
    id: "book-french",
    title: "Cozinha francesa",
    description: "Um novo capítulo para os clássicos da gastronomia francesa.",
    cover: "",
    theme: "ink",
    updated_at: "2026-09-15T12:00:00Z",
  },
  {
    id: "book-garden",
    title: "Da horta à mesa",
    description: "Ingredientes da estação, frescor e cor em cada página.",
    cover: "",
    theme: "cream",
    updated_at: "2026-09-15T12:00:00Z",
  },
  {
    id: "book-dessert",
    title: "Doces & sobremesas",
    description: "Pequenos rituais para terminar a refeição com doçura.",
    cover: "",
    theme: "ink",
    updated_at: "2026-09-15T12:00:00Z",
  },
];
