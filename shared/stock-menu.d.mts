export const MENU_CATEGORIES: string[];
export function menuCategory(item: {
  name: string;
  recipeName?: string;
  groups?: string[];
  catalogCategory?: string;
}): string;
export type RankedSale = {
  name: string;
  quantity: number;
  netValue?: number | null;
  quantityValid?: boolean;
  suspect?: boolean;
  groups?: string[];
};
export function rankSales(
  sales: RankedSale[],
  metric: "quantity" | "value",
): (RankedSale & { rank: number })[];
