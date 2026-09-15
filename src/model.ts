export type Ingredient = {
  id: string;
  name: string;
  quantity: number;
  unit: "g" | "kg";
  price: number;
};
export type Step = { id: string; text: string; photo: string };
export type Recipe = {
  id: string;
  title: string;
  category: string;
  description: string;
  servings: number;
  minutes: number;
  cover: string;
  ingredients: Ingredient[];
  steps: Step[];
  notes: string;
  favorite: boolean;
  updated_at: string;
  user_id?: string;
};
export const categories = [
  "Todas as receitas",
  "Entradas",
  "Principais",
  "Sobremesas",
  "Bebidas",
  "Bases e molhos",
];
export const money = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
export const itemCost = (i: Ingredient) =>
  (i.quantity * i.price) / (i.unit === "g" ? 1000 : 1);
export const totalCost = (r: Recipe) =>
  r.ingredients.reduce((sum, i) => sum + itemCost(i), 0);
export const emptyRecipe = (): Recipe => ({
  id: crypto.randomUUID(),
  title: "",
  category: "Principais",
  description: "",
  servings: 1,
  minutes: 30,
  cover: "",
  ingredients: [
    { id: crypto.randomUUID(), name: "", quantity: 0, unit: "g", price: 0 },
  ],
  steps: [{ id: crypto.randomUUID(), text: "", photo: "" }],
  notes: "",
  favorite: false,
  updated_at: new Date().toISOString(),
});
const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=85`;
const make = (
  id: string,
  title: string,
  category: string,
  image: string,
  minutes: number,
  items: [string, number, number][],
  description: string,
): Recipe => ({
  id,
  title,
  category,
  cover: photo(image),
  minutes,
  servings: 2,
  description,
  ingredients: items.map(([name, quantity, price], index) => ({
    id: `${id}-${index}`,
    name,
    quantity,
    price,
    unit: "g",
  })),
  steps: [
    {
      id: `${id}-step`,
      text: "Separe e pese os ingredientes. Prepare com cuidado, ajuste os temperos e finalize o prato imediatamente antes de servir.",
      photo: "",
    },
  ],
  notes:
    "Receita ilustrativa. Ajuste os ingredientes, custos e modo de preparo à sua cozinha.",
  favorite: id === "demo-1",
  updated_at: "2026-09-15T12:00:00Z",
});
export const examples: Recipe[] = [
  make(
    "demo-1",
    "Salmão & verdes da estação",
    "Principais",
    "photo-1467003909585-2f8a72700288",
    35,
    [
      ["Filé de salmão", 400, 89.9],
      ["Aspargos", 150, 39.9],
      ["Manteiga", 30, 45],
      ["Limão-siciliano", 80, 12],
    ],
    "Salmão dourado, vegetais frescos e um delicado toque cítrico. Simplicidade que surpreende.",
  ),
  make(
    "demo-2",
    "Fusilli ao pomodoro",
    "Principais",
    "photo-1608897013039-887f21d8c804",
    25,
    [
      ["Fusilli", 250, 22],
      ["Tomate italiano", 300, 12],
      ["Azeite", 30, 48],
    ],
    "Massa al dente, tomates doces e o perfume do manjericão fresco.",
  ),
  make(
    "demo-3",
    "Tagliatelle com cogumelos",
    "Principais",
    "photo-1551183053-bf91a1d81141",
    45,
    [
      ["Massa fresca", 300, 28],
      ["Cogumelos frescos", 200, 45],
      ["Parmesão", 60, 95],
    ],
    "Massa envolvida em um molho delicado de cogumelos, finalizada com parmesão.",
  ),
  make(
    "demo-4",
    "Salada da horta",
    "Entradas",
    "photo-1512621776951-a57141f2eefd",
    15,
    [
      ["Mix de folhas", 150, 25],
      ["Vegetais da estação", 250, 14],
      ["Azeite", 20, 48],
    ],
    "Folhas, texturas e cores que celebram os ingredientes da estação.",
  ),
  make(
    "demo-5",
    "Chocolate em texturas",
    "Sobremesas",
    "photo-1578985545062-69928b1d9587",
    60,
    [
      ["Chocolate 70%", 180, 68],
      ["Creme de leite", 150, 22],
      ["Manteiga", 60, 45],
    ],
    "Chocolate intenso em uma sobremesa feita para encerrar com delicadeza.",
  ),
  make(
    "demo-6",
    "Pesto de manjericão",
    "Bases e molhos",
    "photo-1473093226795-af9932fe5856",
    10,
    [
      ["Manjericão", 100, 35],
      ["Azeite", 100, 48],
      ["Parmesão", 80, 95],
    ],
    "Uma base aromática e versátil para dar personalidade às suas criações.",
  ),
];
