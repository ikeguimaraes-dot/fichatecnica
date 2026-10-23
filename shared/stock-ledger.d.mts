export const STOCK_START: string;
export type Requirement = {
  itemId: number;
  unit: string;
  name: string;
  quantity: number;
};
export type Dish = {
  id: string;
  recipeId: number;
  name: string;
  recipeName: string;
  itemId?: number;
  priorities?: {
    itemId: number;
    name: string;
    unit: string;
    appliedCost: number | null;
    preparation: boolean;
  }[];
  principal?: {
    itemId: number;
    name: string;
    unit: string;
    appliedCost: number;
    preparation: boolean;
  } | null;
  sold: number;
  outputPerSale: number | null;
  outputUnit: string;
  requirements: Requirement[];
  reason: string | null;
};
export type StockContext = {
  unit: { id: number; name: string };
  start: string;
  end: string;
  lastDate: string | null;
  syncedAt: string | null;
  snapshotId?: string | null;
  canEdit: boolean;
  daily: {
    date: string;
    workdays: number;
    products: number;
    quantity: number;
  }[];
  issues: string[];
  pending: {
    name: string;
    quantity: number;
    reason: string;
    recipeId: number | null;
    outputPerSale: number | null;
  }[];
  dishes: Dish[];
  options: { id: number; name: string; unit: string; yield: number }[];
  sales: {
    name: string;
    quantity: number;
    quantityValid?: boolean;
    netValue?: number | null;
    suspect?: boolean;
    groups?: string[];
  }[];
};
export type StockCatalog = {
  id: number;
  category: string;
  packaging?: {
    id: number | null;
    unit: string;
    factor: number | null;
    stock: boolean;
  }[];
};
export type StockEntry = {
  itemId: number | null;
  name: string;
  unit: string;
  quantity: number | null;
  convertedQuantity?: number | null;
  packagingId?: number | null;
  category: string;
  invoice: { unitId: number; number: string };
};
export type Ledger = {
  rows: {
    itemId: number;
    unit: string;
    name: string;
    category: string;
    received: number;
    consumed: number;
    balance: number;
  }[];
  dishes: (Dish & {
    portions: number | null;
    limiting: (Requirement & { balance: number })[];
    status: string;
  })[];
  issues: string[];
  complete: boolean;
};
export function computeLedger(input: {
  entries: StockEntry[];
  catalog: StockCatalog[];
  context: StockContext;
  missingInvoices?: number;
}): Ledger;
export function saleKey(name: unknown): string;
export function measure(unit: unknown): [string, number];
export function finite(value: unknown): number | null;
