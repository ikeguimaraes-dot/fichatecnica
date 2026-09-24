export function isProduction(name: string): boolean;
export function includedRecipe(
  raw: { id_fichatecnica: number; id_item: number; ds_item: string },
  unitId: number,
  upstreamMember: boolean,
): boolean;
export function recipeHouse(name: string): number | null;
export function excludedRecipe(name: string): boolean;
export function recipeCategory(name: string): "food" | "drink";
export function visibleRecipe(name: string, unitId: number): boolean;
