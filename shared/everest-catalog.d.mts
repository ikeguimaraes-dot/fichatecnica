export function isProduction(name: string): boolean;
export function recipeHouse(name: string): number | null;
export function excludedRecipe(name: string): boolean;
export function recipeCategory(name: string): "food" | "drink";
export function visibleRecipe(name: string, unitId: number): boolean;
