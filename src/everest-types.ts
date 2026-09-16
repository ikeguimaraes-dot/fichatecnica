export type EverestComponent = {
  itemId: number | null;
  code: string;
  name: string;
  packaging: string;
  unit: string;
  quantity: number | null;
  utilization: number | null;
  type: number | null;
  unitCost: number | null;
  appliedCost: number | null;
  stockUnitCost: number | null;
  costBasis: "composition" | "everest" | "unmatched";
};
export type EverestRecord = {
  id: number;
  itemId: number | null;
  code: string;
  name: string;
  unit: string;
  quantity: number | null;
  yieldKg: number | null;
  version: number | null;
  versionDate: string;
  status: number | null;
  released: boolean;
  componentCount: number;
};
export type EverestDetail = EverestRecord & {
  packaging: string;
  instructions: string;
  notes: string;
  shelfLifeDays: number | null;
  components: EverestComponent[];
  costStatus:
    "available" | "review" | "partial" | "unavailable" | "version_mismatch";
  totalCost: number | null;
  costPerKg: number | null;
  costAudit: {
    sourceTotal: number | null;
    difference: number | null;
    zeroCostItems: string[];
    missingCostItems: string[];
    stocklessCostItems: string[];
  } | null;
};
export type EverestPage = {
  records: EverestRecord[];
  page: number;
  totalPages: number;
  environment: string;
  fetchedAt: string;
};

export type EverestUnit = { id: number; name: string };
export type EverestCollection<T> = Omit<EverestPage, "records"> & {
  records: T[];
};
